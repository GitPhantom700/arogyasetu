"""
Database connection and initialization module for Healthcare Logistics Platform.
Uses Python standard library sqlite3 with strict foreign keys, WAL mode, and ACID transactions.
Hardened with GS1 traceability, deterministic single-phase SHA-256 ledgering, and async offloading.
"""

import sqlite3
import os
import sys
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, Dict, Any, Callable
import anyio

# Determine base paths
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "healthcare.db"
DEFAULT_SCHEMA_PATH = BACKEND_DIR / "schema.sql"


def _sqlite3_connect(path: Path) -> sqlite3.Connection:
    """
    Connects to SQLite with autocommit enabled across Python versions.
    Python 3.12+ added `autocommit=True` (PEP 674), while Python 3.11 and earlier
    use `isolation_level=None` for explicit transaction management.
    """
    kwargs: Dict[str, Any] = {"timeout": 30.0, "check_same_thread": False}
    if sys.version_info >= (3, 12):
        kwargs["autocommit"] = True
    else:
        kwargs["isolation_level"] = None
    return sqlite3.connect(str(path), **kwargs)


def get_db_path() -> Path:
    """Returns the database file path, allowing override via environment variable."""
    return Path(os.getenv("HEALTHCARE_DB_PATH", str(DEFAULT_DB_PATH)))


def get_connection(db_path: Path = None) -> sqlite3.Connection:
    """
    Creates and returns a SQLite connection with foreign keys and WAL mode enabled,
    autocommit enabled for explicit transaction control, synchronous=NORMAL, and 30s busy_timeout.
    """
    path = db_path or get_db_path()
    conn = _sqlite3_connect(path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db_context(db_path: Path = None, immediate: bool = True):
    """
    Context manager for database operations with automatic transaction commit/rollback.
    Uses BEGIN IMMEDIATE for write transactions to acquire write lock upfront and eliminate
    shared-lock upgrade deadlocks under high concurrent load in WAL mode.
    """
    conn = get_connection(db_path)
    if immediate:
        conn.execute("BEGIN IMMEDIATE;")
    else:
        conn.execute("BEGIN;")
    try:
        yield conn
        conn.execute("COMMIT;")
    except Exception:
        conn.execute("ROLLBACK;")
        raise
    finally:
        conn.close()


def compute_deterministic_hash(
    previous_hash: str,
    facility_gln: str,
    gtin: str,
    batch_number: str,
    expiry_date: str,
    transaction_type: str,
    quantity: int,
    balance_after: int,
    reference_id: Optional[str],
    logged_by: str,
    created_at_iso: str,
    user_reported_at_iso: str
) -> str:
    """
    Computes a deterministic SHA-256 hash using strict ISO-8601 UTC microsecond strings
    and canonical GS1/DSCSA traceability identifiers.
    """
    prev = previous_hash or ("0" * 64)
    ref = reference_id or ""
    payload = (
        f"{prev}|{facility_gln}|{gtin}|{batch_number}|{expiry_date}|"
        f"{transaction_type}|{quantity}|{balance_after}|{ref}|"
        f"{logged_by}|{created_at_iso}|{user_reported_at_iso}"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# Alias for backward compatibility
compute_transaction_hash = compute_deterministic_hash


class LedgerIntegrityError(Exception):
    """Raised when cryptographic hash chain tampering or invalid linkage is detected."""
    pass


def verify_dscsa_ledger_integrity(
    conn: Optional[sqlite3.Connection] = None,
    db_path: Optional[Path] = None,
    chunk_size: int = 1000
) -> Dict[str, Any]:
    """
    Validates the complete DSCSA / NHM cryptographic hash chain across all inventory_transactions.
    Streams ledger rows in memory-constant chunks via cursor.fetchmany(chunk_size) to eliminate
    O(N) memory bottlenecks and prevent Out-Of-Memory (OOM) crashes across large ledgers.
    Preserves previous_hash across chunk boundaries for unbroken mathematical continuity.
    Raises LedgerIntegrityError if any block has been tampered with or if hash continuity is violated.
    """
    should_close = False
    if conn is None:
        path = db_path or get_db_path()
        conn = sqlite3.connect(str(path))
        conn.row_factory = sqlite3.Row
        should_close = True

    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM inventory_transactions ORDER BY id ASC;")
        
        total_verified = 0
        last_hash = None
        prev_tx_hash = None

        while True:
            chunk = cur.fetchmany(chunk_size)
            if not chunk:
                break

            for curr_tx in chunk:
                # 1. Chain continuity check across current block and previous block
                if total_verified > 0:
                    if curr_tx["previous_hash"] != prev_tx_hash:
                        raise LedgerIntegrityError(
                            f"Ledger linkage broken at transaction ID {curr_tx['id']}! "
                            f"Expected previous_hash '{prev_tx_hash}', got '{curr_tx['previous_hash']}'."
                        )

                # 2. Block content integrity check (deterministic re-computation)
                user_rep = str(curr_tx["user_reported_at"]) if curr_tx["user_reported_at"] else str(curr_tx["created_at"])
                computed_hash = compute_deterministic_hash(
                    previous_hash=curr_tx["previous_hash"],
                    facility_gln=curr_tx["facility_gln"],
                    gtin=curr_tx["gtin"],
                    batch_number=curr_tx["batch_number"],
                    expiry_date=curr_tx["expiry_date"],
                    transaction_type=curr_tx["transaction_type"],
                    quantity=curr_tx["quantity"],
                    balance_after=curr_tx["balance_after"],
                    reference_id=curr_tx["reference_id"],
                    logged_by=curr_tx["logged_by"],
                    created_at_iso=str(curr_tx["created_at"]),
                    user_reported_at_iso=user_rep
                )

                if curr_tx["hash"] != computed_hash:
                    raise LedgerIntegrityError(
                        f"Cryptographic tampering detected at transaction ID {curr_tx['id']}! "
                        f"Stored hash: '{curr_tx['hash']}', Computed hash: '{computed_hash}'."
                    )

                prev_tx_hash = curr_tx["hash"]
                last_hash = curr_tx["hash"]
                total_verified += 1

        return {
            "status": "VERIFIED",
            "total_transactions": total_verified,
            "chain_valid": True,
            "latest_hash": last_hash
        }
    finally:
        if should_close:
            conn.close()


def record_inventory_transaction(
    cursor: sqlite3.Cursor,
    facility_id: int,
    medicine_id: int,
    batch_id: int,
    batch_number: str,
    expiry_date: str,
    transaction_type: str,
    quantity: int,
    balance_after: int,
    facility_gln: str = "8901234567890",
    gtin: str = "08901234567890",
    serial_number: Optional[str] = None,
    transfer_id: Optional[int] = None,
    reference_id: Optional[str] = None,
    notes: Optional[str] = None,
    logged_by: str = "System",
    abha_id: Optional[str] = None,
    consent_token: Optional[str] = None,
    user_reported_at: Optional[str] = None
) -> Dict[str, Any]:
    """
    Records an append-only, DSCSA & NHM compliant cryptographically hash-chained
    transaction ledger entry using a SINGLE-PHASE atomic INSERT (no 'PENDING' state).
    """
    # 1. Fetch previous transaction hash (deterministic order by id)
    cursor.execute("SELECT hash FROM inventory_transactions ORDER BY id DESC LIMIT 1;")
    prev_row = cursor.fetchone()
    previous_hash = prev_row["hash"] if prev_row and prev_row["hash"] else ("0" * 64)

    # 2. Strict ISO-8601 UTC microsecond timestamps computed upfront in Python
    now_utc = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    user_reported_iso = user_reported_at or now_utc

    # 3. Compute deterministic cryptographic seal prior to SQL execution
    current_hash = compute_deterministic_hash(
        previous_hash=previous_hash,
        facility_gln=facility_gln,
        gtin=gtin,
        batch_number=batch_number,
        expiry_date=expiry_date,
        transaction_type=transaction_type,
        quantity=quantity,
        balance_after=balance_after,
        reference_id=reference_id,
        logged_by=logged_by,
        created_at_iso=now_utc,
        user_reported_at_iso=user_reported_iso,
    )

    # 4. Atomic Single-Phase INSERT (No 'PENDING' state, no subsequent UPDATE)
    cursor.execute("""
        INSERT INTO inventory_transactions (
            facility_id, facility_gln, medicine_id, gtin, batch_id, transfer_id,
            batch_number, serial_number, expiry_date, transaction_type, quantity,
            balance_after, reference_id, notes, logged_by, abha_id, consent_token,
            user_reported_at, created_at, previous_hash, hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        facility_id, facility_gln, medicine_id, gtin, batch_id, transfer_id,
        batch_number, serial_number, expiry_date, transaction_type, quantity,
        balance_after, reference_id, notes, logged_by, abha_id, consent_token,
        user_reported_iso, now_utc, previous_hash, current_hash
    ))
    tx_id = cursor.lastrowid

    return {
        "id": tx_id,
        "facility_id": facility_id,
        "facility_gln": facility_gln,
        "medicine_id": medicine_id,
        "gtin": gtin,
        "batch_id": batch_id,
        "batch_number": batch_number,
        "serial_number": serial_number,
        "expiry_date": expiry_date,
        "transaction_type": transaction_type,
        "quantity": quantity,
        "balance_after": balance_after,
        "transfer_id": transfer_id,
        "reference_id": reference_id,
        "notes": notes,
        "logged_by": logged_by,
        "abha_id": abha_id,
        "consent_token": consent_token,
        "user_reported_at": user_reported_iso,
        "created_at": now_utc,
        "previous_hash": previous_hash,
        "hash": current_hash,
    }


def execute_write_transaction_sync(db_path: Path, fn: Callable, *args, **kwargs):
    """Executes write transaction using BEGIN IMMEDIATE with busy_timeout=30000."""
    path = db_path or get_db_path()
    conn = _sqlite3_connect(path)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 30000;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("BEGIN IMMEDIATE;")
        try:
            result = fn(conn, *args, **kwargs)
            conn.execute("COMMIT;")
            return result
        except Exception:
            conn.execute("ROLLBACK;")
            raise
    finally:
        conn.close()


async def execute_write_transaction_async(db_path: Path, fn: Callable, *args, **kwargs):
    """Offloads database writes away from FastAPI's main worker threadpool via anyio."""
    return await anyio.to_thread.run_sync(execute_write_transaction_sync, db_path, fn, *args, **kwargs)


def init_db(db_path: Path = None, schema_path: Path = None) -> None:
    """
    Initializes the database schema from schema.sql.
    """
    target_db = db_path or get_db_path()
    target_schema = schema_path or DEFAULT_SCHEMA_PATH

    if not target_schema.exists():
        raise FileNotFoundError(f"Schema file not found at: {target_schema}")

    with open(target_schema, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    with get_db_context(target_db) as conn:
        conn.executescript(schema_sql)


if __name__ == "__main__":
    print(f"Initializing database at: {get_db_path()}")
    init_db()
    print("Database initialized successfully.")
