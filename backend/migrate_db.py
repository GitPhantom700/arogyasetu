import sqlite3

def run_migration():
    conn = sqlite3.connect('healthcare.db')
    cursor = conn.cursor()

    columns_to_add = [
        ('facilities', 'hfr_id TEXT DEFAULT NULL'),
        ('stock_batches', 'temperature_celsius REAL DEFAULT 4.2'),
        ('stock_batches', "thermal_status TEXT DEFAULT 'OPTIMAL'"),
        ('stock_batches', 'last_temp_breach_at TIMESTAMP DEFAULT NULL'),
        ('transfers', 'authorizer_hpr_id TEXT DEFAULT NULL'),
        ('inventory_transactions', 'abha_id TEXT DEFAULT NULL'),
        ('inventory_transactions', 'consent_token TEXT DEFAULT NULL'),
    ]

    for table, col_def in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col_def};")
            print(f"Added {col_def} to {table}")
        except Exception as e:
            print(f"Skip {table}.{col_def}: {e}")

    # Populate HFR IDs for authentic facilities
    hfr_map = {
        "DH-PUN-01": "IN-MH-PUN-00421",
        "SDH-PUN-01": "IN-MH-PUN-00108",
        "CHC-PUN-01": "IN-MH-PUN-00302",
        "CHC-PUN-02": "IN-MH-PUN-00215",
        "PHC-PUN-01": "IN-MH-PUN-00143",
        "PHC-PUN-02": "IN-MH-PUN-00088",
        "PHC-PUN-03": "IN-MH-PUN-00192",
        "PHC-PUN-04": "IN-MH-PUN-00164",
        "SC-PUN-01": "IN-MH-PUN-00012",
        "DH-SAT-01": "IN-MH-SAT-00311",
        "CHC-SAT-01": "IN-MH-SAT-00204",
        "PHC-SAT-01": "IN-MH-SAT-00122",
        "PHC-SAT-02": "IN-MH-SAT-00155",
        "PHC-SAT-03": "IN-MH-SAT-00178",
        "SC-SAT-01": "IN-MH-SAT-00009"
    }

    for code, hfr in hfr_map.items():
        cursor.execute("UPDATE facilities SET hfr_id = ? WHERE facility_code = ?;", (hfr, code))

    conn.commit()
    conn.close()
    print("Migration completed successfully.")

if __name__ == "__main__":
    run_migration()
