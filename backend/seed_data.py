"""
Realistic Seed Data Generator for Healthcare Supply Chain Platform.
Hardened with Public Health Domain Realities:
- 15 Real Facilities with Terrain Type (Highway / Plains / Ghat Mountain), Cold-Chain, Backup Power, & GS1 GLN
- 10 Essential Medicines with Cold-Chain Requirements, Seasonality Flags, & GS1 GTIN-14
- Multi-batch Inventory Records with GS1 Serial Numbers & Full Cryptographic Ledger Traceability
"""

import sys
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from database import get_connection, init_db, get_db_path, record_inventory_transaction
from abdm_gateway import MOCK_HFR_DB

FACILITIES_SEED = [
    # Pune District Facilities
    {
        "facility_code": "DH-PUN-01",
        "facility_gln": "8901234567001",
        "name": "District Hospital Aundh",
        "tier": "DH",
        "district": "Pune",
        "state": "Maharashtra",
        "latitude": 18.5580,
        "longitude": 73.8075,
        "terrain_type": "HIGHWAY_CORRIDOR",
        "contact_phone": "+91-20-27271234",
        "contact_person": "Dr. Ramesh Patil (Civil Surgeon)",
        "total_beds": 250,
        "icu_beds": 30,
        "oxygen_beds": 50,
        "has_cold_chain": 1,
        "power_backup_hours": 48,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "SDH-PUN-01",
        "facility_gln": "8901234567002",
        "name": "Sub-District Hospital Shirur",
        "tier": "SDH",
        "district": "Pune",
        "state": "Maharashtra",
        "latitude": 18.8273,
        "longitude": 74.3789,
        "terrain_type": "PLAINS",
        "contact_phone": "+91-2138-222345",
        "contact_person": "Dr. Sunita Deshmukh",
        "total_beds": 100,
        "icu_beds": 10,
        "oxygen_beds": 25,
        "has_cold_chain": 1,
        "power_backup_hours": 24,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "CHC-PUN-01",
        "facility_gln": "8901234567003",
        "name": "Community Health Centre Khed",
        "tier": "CHC",
        "district": "Pune",
        "state": "Maharashtra",
        "latitude": 18.8500,
        "longitude": 73.9100,
        "terrain_type": "HIGHWAY_CORRIDOR",
        "contact_phone": "+91-2135-224567",
        "contact_person": "Dr. Anil Shinde",
        "total_beds": 50,
        "icu_beds": 4,
        "oxygen_beds": 12,
        "has_cold_chain": 1,
        "power_backup_hours": 18,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "CHC-PUN-02",
        "facility_gln": "8901234567004",
        "name": "Community Health Centre Junnar",
        "tier": "CHC",
        "district": "Pune",
        "state": "Maharashtra",
        "latitude": 19.2083,
        "longitude": 73.8767,
        "terrain_type": "GHAT_MOUNTAIN",
        "contact_phone": "+91-2132-242100",
        "contact_person": "Dr. Priya Kulkarni",
        "total_beds": 50,
        "icu_beds": 4,
        "oxygen_beds": 12,
        "has_cold_chain": 1,
        "power_backup_hours": 16,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "PHC-PUN-01",
        "facility_gln": "8901234567005",
        "name": "Primary Health Centre Kalyanpur",
        "tier": "PHC",
        "district": "Pune",
        "state": "Maharashtra",
        "latitude": 18.5204,
        "longitude": 73.8567,
        "terrain_type": "PLAINS",
        "contact_phone": "+91-9822011223",
        "contact_person": "Dr. Rajesh Gaikwad (Medical Officer)",
        "total_beds": 12,
        "icu_beds": 1,
        "oxygen_beds": 3,
        "has_cold_chain": 1,
        "power_backup_hours": 12,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "PHC-PUN-02",
        "facility_gln": "8901234567006",
        "name": "Primary Health Centre Paud",
        "tier": "PHC",
        "district": "Pune",
        "state": "Maharashtra",
        "latitude": 18.5333,
        "longitude": 73.6167,
        "terrain_type": "GHAT_MOUNTAIN",
        "contact_phone": "+91-9822022334",
        "contact_person": "Dr. Kavita Joshi",
        "total_beds": 10,
        "icu_beds": 0,
        "oxygen_beds": 2,
        "has_cold_chain": 1,
        "power_backup_hours": 8,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "PHC-PUN-03",
        "facility_gln": "8901234567007",
        "name": "Primary Health Centre Narayangaon",
        "tier": "PHC",
        "district": "Pune",
        "state": "Maharashtra",
        "latitude": 19.1225,
        "longitude": 73.9786,
        "terrain_type": "HIGHWAY_CORRIDOR",
        "contact_phone": "+91-9822033445",
        "contact_person": "Dr. Sachin Jagtap",
        "total_beds": 15,
        "icu_beds": 1,
        "oxygen_beds": 4,
        "has_cold_chain": 1,
        "power_backup_hours": 12,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "PHC-PUN-04",
        "facility_gln": "8901234567008",
        "name": "Primary Health Centre Saswad",
        "tier": "PHC",
        "district": "Pune",
        "state": "Maharashtra",
        "latitude": 18.3444,
        "longitude": 74.0286,
        "terrain_type": "PLAINS",
        "contact_phone": "+91-9822044556",
        "contact_person": "Dr. Meera Jadhav",
        "total_beds": 15,
        "icu_beds": 1,
        "oxygen_beds": 3,
        "has_cold_chain": 1,
        "power_backup_hours": 12,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "SC-PUN-01",
        "facility_gln": "8901234567009",
        "name": "Sub-Centre Velhe (Ghat Area)",
        "tier": "SC",
        "district": "Pune",
        "state": "Maharashtra",
        "latitude": 18.2936,
        "longitude": 73.6339,
        "terrain_type": "GHAT_MOUNTAIN",
        "contact_phone": "+91-9822055667",
        "contact_person": "Sister Shobha More (ANM)",
        "total_beds": 4,
        "icu_beds": 0,
        "oxygen_beds": 1,
        "has_cold_chain": 0,  # SC relies on cold boxes from parent PHC
        "power_backup_hours": 4,
        "has_dedicated_vehicle": 0
    },

    # Satara District Facilities
    {
        "facility_code": "DH-SAT-01",
        "facility_gln": "8901234567010",
        "name": "Civil Hospital Kranti Sinh Nana Patil",
        "tier": "DH",
        "district": "Satara",
        "state": "Maharashtra",
        "latitude": 17.6805,
        "longitude": 73.9933,
        "terrain_type": "HIGHWAY_CORRIDOR",
        "contact_phone": "+91-2162-234567",
        "contact_person": "Dr. Subhash Chavan (Civil Surgeon)",
        "total_beds": 200,
        "icu_beds": 25,
        "oxygen_beds": 45,
        "has_cold_chain": 1,
        "power_backup_hours": 48,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "SDH-SAT-01",
        "facility_gln": "8901234567011",
        "name": "Sub-District Hospital Karad",
        "tier": "SDH",
        "district": "Satara",
        "state": "Maharashtra",
        "latitude": 17.2892,
        "longitude": 74.1818,
        "terrain_type": "HIGHWAY_CORRIDOR",
        "contact_phone": "+91-2164-221234",
        "contact_person": "Dr. Nitin Bhosale",
        "total_beds": 100,
        "icu_beds": 8,
        "oxygen_beds": 20,
        "has_cold_chain": 1,
        "power_backup_hours": 24,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "CHC-SAT-01",
        "facility_gln": "8901234567012",
        "name": "Community Health Centre Wai",
        "tier": "CHC",
        "district": "Satara",
        "state": "Maharashtra",
        "latitude": 17.9497,
        "longitude": 73.8928,
        "terrain_type": "PLAINS",
        "contact_phone": "+91-2167-220456",
        "contact_person": "Dr. Deepak Salunkhe",
        "total_beds": 40,
        "icu_beds": 3,
        "oxygen_beds": 10,
        "has_cold_chain": 1,
        "power_backup_hours": 16,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "PHC-SAT-01",
        "facility_gln": "8901234567013",
        "name": "Primary Health Centre Medha (Jawali)",
        "tier": "PHC",
        "district": "Satara",
        "state": "Maharashtra",
        "latitude": 17.7558,
        "longitude": 73.8436,
        "terrain_type": "GHAT_MOUNTAIN",
        "contact_phone": "+91-9823011990",
        "contact_person": "Dr. Vandana Pawar",
        "total_beds": 12,
        "icu_beds": 0,
        "oxygen_beds": 2,
        "has_cold_chain": 1,
        "power_backup_hours": 8,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "PHC-SAT-02",
        "facility_gln": "8901234567014",
        "name": "Primary Health Centre Khandala",
        "tier": "PHC",
        "district": "Satara",
        "state": "Maharashtra",
        "latitude": 18.0494,
        "longitude": 74.0272,
        "terrain_type": "HIGHWAY_CORRIDOR",
        "contact_phone": "+91-9823022881",
        "contact_person": "Dr. Sanjay Mane",
        "total_beds": 12,
        "icu_beds": 1,
        "oxygen_beds": 3,
        "has_cold_chain": 1,
        "power_backup_hours": 12,
        "has_dedicated_vehicle": 1
    },
    {
        "facility_code": "SC-SAT-01",
        "facility_gln": "8901234567015",
        "name": "Sub-Centre Mahabaleshwar Forest Fringe",
        "tier": "SC",
        "district": "Satara",
        "state": "Maharashtra",
        "latitude": 17.9237,
        "longitude": 73.6586,
        "terrain_type": "GHAT_MOUNTAIN",
        "contact_phone": "+91-9823033772",
        "contact_person": "Sister Lata Ghorpade (ANM)",
        "total_beds": 4,
        "icu_beds": 0,
        "oxygen_beds": 1,
        "has_cold_chain": 0,  # SC relies on cold boxes
        "power_backup_hours": 4,
        "has_dedicated_vehicle": 0
    }
]

MEDICINES_SEED = [
    {
        "sku": "MED-ASV-01",
        "gtin": "08901234560010",
        "name": "Anti-Snake Venom (ASV) Polyvalent",
        "category": "Antidote",
        "unit": "vials",
        "min_safety_stock": 20,
        "is_emergency": 1,
        "requires_cold_chain": 1,
        "storage_temp_c": "2-8 C (Cold Chain)",
        "seasonal_risk_months": "MONSOON_JUN_SEP",
        "description": "Lyophilized polyvalent anti-snake venom for Indian cobra, common krait, Russell's viper, and saw-scaled viper bites."
    },
    {
        "sku": "MED-ARV-01",
        "gtin": "08901234560027",
        "name": "Anti-Rabies Vaccine (ARV) Purified Vero Cell",
        "category": "Vaccine",
        "unit": "vials",
        "min_safety_stock": 30,
        "is_emergency": 1,
        "requires_cold_chain": 1,
        "storage_temp_c": "2-8 C (Cold Chain)",
        "seasonal_risk_months": "ALL",
        "description": "Post-exposure prophylaxis against rabies virus following animal bites."
    },
    {
        "sku": "MED-INS-01",
        "gtin": "08901234560034",
        "name": "Regular Human Insulin 40 IU/ml",
        "category": "Emergency",
        "unit": "vials",
        "min_safety_stock": 25,
        "is_emergency": 1,
        "requires_cold_chain": 1,
        "storage_temp_c": "2-8 C (Cold Chain)",
        "seasonal_risk_months": "ALL",
        "description": "Short-acting human insulin for diabetic emergency ketoacidosis and glycemic management."
    },
    {
        "sku": "MED-ORS-01",
        "gtin": "08901234560041",
        "name": "Oral Rehydration Salts (ORS) WHO Formula",
        "category": "Emergency",
        "unit": "sachets",
        "min_safety_stock": 150,
        "is_emergency": 0,
        "requires_cold_chain": 0,
        "storage_temp_c": "Ambient",
        "seasonal_risk_months": "MONSOON_JUN_SEP",
        "description": "WHO-recommended low osmolarity formula for acute diarrhoeal dehydration."
    },
    {
        "sku": "MED-PCM-01",
        "gtin": "08901234560058",
        "name": "Paracetamol 500mg Tablets",
        "category": "Analgesic",
        "unit": "strips",
        "min_safety_stock": 200,
        "is_emergency": 0,
        "requires_cold_chain": 0,
        "storage_temp_c": "Ambient",
        "seasonal_risk_months": "ALL",
        "description": "Antipyretic and analgesic for fever and pain management."
    },
    {
        "sku": "MED-AMX-01",
        "gtin": "08901234560065",
        "name": "Amoxicillin 500mg Capsules",
        "category": "Antibiotic",
        "unit": "strips",
        "min_safety_stock": 100,
        "is_emergency": 0,
        "requires_cold_chain": 0,
        "storage_temp_c": "Ambient",
        "seasonal_risk_months": "ALL",
        "description": "Broad-spectrum beta-lactam antibiotic for bacterial infections."
    },
    {
        "sku": "MED-RLF-01",
        "gtin": "08901234560072",
        "name": "Ringer Lactate (RL) 500ml Infusion",
        "category": "IV Fluid",
        "unit": "bottles",
        "min_safety_stock": 80,
        "is_emergency": 1,
        "requires_cold_chain": 0,
        "storage_temp_c": "Ambient",
        "seasonal_risk_months": "ALL",
        "description": "Isotonic crystalloid fluid for emergency trauma, hypovolemia, and severe dehydration."
    },
    {
        "sku": "MED-OXY-01",
        "gtin": "08901234560089",
        "name": "Oxytocin Injection 5 IU/ml",
        "category": "Emergency",
        "unit": "ampoules",
        "min_safety_stock": 40,
        "is_emergency": 1,
        "requires_cold_chain": 1,
        "storage_temp_c": "2-8 C (Cold Chain)",
        "seasonal_risk_months": "ALL",
        "description": "Uterotonic agent for postpartum hemorrhage (PPH) prevention and maternal emergency care."
    },
    {
        "sku": "MED-ACT-01",
        "gtin": "08901234560096",
        "name": "Artemether + Lumefantrine (ACT) Tablets",
        "category": "Emergency",
        "unit": "strips",
        "min_safety_stock": 50,
        "is_emergency": 0,
        "requires_cold_chain": 0,
        "storage_temp_c": "Ambient",
        "seasonal_risk_months": "MONSOON_JUN_SEP",
        "description": "First-line combination therapy for acute uncomplicated Plasmodium falciparum malaria."
    },
    {
        "sku": "MED-ATV-01",
        "gtin": "08901234560102",
        "name": "Atropine Sulphate Injection 0.6mg/ml",
        "category": "Antidote",
        "unit": "ampoules",
        "min_safety_stock": 30,
        "is_emergency": 1,
        "requires_cold_chain": 0,
        "storage_temp_c": "Ambient",
        "seasonal_risk_months": "HARVEST_OCT_DEC",
        "description": "Antidote for agricultural organophosphate and carbamate pesticide poisonings."
    }
]


def seed_database(db_path=None, reset_schema=True):
    """
    Populates the database with realistic facilities, medicines, multi-batch stocks,
    and initial ledger records with GS1 GLN and GTIN-14 compliance.
    """
    target_db = db_path or get_db_path()
    if reset_schema and target_db.exists():
        try:
            target_db.unlink()
        except PermissionError:
            pass
    init_db(target_db)  # Ensure clean schema

    conn = get_connection(target_db)
    cursor = conn.cursor()

    try:
        # 1. Clear existing seed data safely
        cursor.execute("DELETE FROM transfer_batch_allocations;")
        cursor.execute("DELETE FROM inventory_transactions;")
        cursor.execute("DELETE FROM transfers;")
        cursor.execute("DELETE FROM stock_batches;")
        cursor.execute("DELETE FROM medicines;")
        cursor.execute("DELETE FROM facilities;")
        cursor.execute("DELETE FROM sqlite_sequence;")
        conn.commit()

        # 2. Insert Facilities
        print(f"[SEED] Inserting {len(FACILITIES_SEED)} facilities across Pune & Satara...")
        facility_id_map = {}
        facility_gln_map = {}
        for f in FACILITIES_SEED:
            cursor.execute("""
                INSERT INTO facilities (
                    facility_code, facility_gln, hfr_id, name, tier, district, state, latitude, longitude,
                    terrain_type, contact_phone, contact_person, total_beds, icu_beds,
                    oxygen_beds, has_cold_chain, power_backup_hours, has_dedicated_vehicle
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                f["facility_code"], f["facility_gln"], next((k for k, v in MOCK_HFR_DB.items() if v["facility_code"] == f["facility_code"]), f"TEMP-HFR-{f['facility_code']}"),
                f["name"], f["tier"], f["district"], f["state"],
                f["latitude"], f["longitude"], f["terrain_type"], f["contact_phone"],
                f["contact_person"], f["total_beds"], f["icu_beds"], f["oxygen_beds"],
                f["has_cold_chain"], f["power_backup_hours"], f["has_dedicated_vehicle"]
            ))
            f_id = cursor.lastrowid
            facility_id_map[f["facility_code"]] = f_id
            facility_gln_map[f["facility_code"]] = f["facility_gln"]
        conn.commit()

        # 3. Insert Medicines
        print(f"[SEED] Inserting {len(MEDICINES_SEED)} essential medicines...")
        medicine_id_map = {}
        medicine_gtin_map = {}
        for m in MEDICINES_SEED:
            cursor.execute("""
                INSERT INTO medicines (
                    sku, gtin, name, category, unit, min_safety_stock, is_emergency,
                    requires_cold_chain, storage_temp_c, seasonal_risk_months, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                m["sku"], m["gtin"], m["name"], m["category"], m["unit"],
                m["min_safety_stock"], m["is_emergency"], m["requires_cold_chain"],
                m["storage_temp_c"], m["seasonal_risk_months"], m["description"]
            ))
            m_id = cursor.lastrowid
            medicine_id_map[m["sku"]] = m_id
            medicine_gtin_map[m["sku"]] = m["gtin"]
        conn.commit()

        # 4. Insert Batch Inventories & Initial Ledger Entries
        print("[SEED] Generating realistic multi-batch stock allocations and audit trails...")
        total_batches = 0
        total_transactions = 0

        # Current date anchor for realistic expiry dates
        today = datetime(2026, 9, 5)

        for f_code, f_id in facility_id_map.items():
            f_tier = next(f["tier"] for f in FACILITIES_SEED if f["facility_code"] == f_code)
            f_has_cold_chain = next(f["has_cold_chain"] for f in FACILITIES_SEED if f["facility_code"] == f_code)
            f_gln = facility_gln_map[f_code]

            for m_sku, m_id in medicine_id_map.items():
                m_requires_cold = next(m["requires_cold_chain"] for m in MEDICINES_SEED if m["sku"] == m_sku)
                m_gtin = medicine_gtin_map[m_sku]

                # Cold chain safety constraint: Facilities without cold chain cannot store cold-chain drugs!
                if m_requires_cold and not f_has_cold_chain:
                    continue

                if f_tier == "DH":
                    batches_config = [
                        {"batch_no": f"{m_sku[:7]}-DH-B1", "serial_no": f"SN-{f_code}-{m_sku[:7]}-001", "days_to_exp": 180, "qty": 45},
                        {"batch_no": f"{m_sku[:7]}-DH-B2", "serial_no": f"SN-{f_code}-{m_sku[:7]}-002", "days_to_exp": 450, "qty": 85},
                    ]
                    if m_sku == "MED-PCM-01":
                        batches_config.insert(0, {"batch_no": f"{m_sku[:7]}-DH-EXP", "serial_no": f"SN-{f_code}-{m_sku[:7]}-EXP", "days_to_exp": 19, "qty": 25})
                elif f_tier in ("SDH", "CHC"):
                    batches_config = [
                        {"batch_no": f"{m_sku[:7]}-CHC-B1", "serial_no": f"SN-{f_code}-{m_sku[:7]}-001", "days_to_exp": 240, "qty": 35},
                    ]
                    if m_sku == "MED-PCM-01":
                        batches_config.insert(0, {"batch_no": f"{m_sku[:7]}-EXP-20D", "serial_no": f"SN-{f_code}-{m_sku[:7]}-EXP", "days_to_exp": 22, "qty": 15})
                    elif m_sku == "MED-ASV-01":
                        batches_config.insert(0, {"batch_no": f"{m_sku[:7]}-EXP-12D", "serial_no": f"SN-{f_code}-{m_sku[:7]}-EXP", "days_to_exp": 14, "qty": 6})
                elif f_tier == "PHC":
                    if f_code in ("PHC-PUN-01", "PHC-SAT-01") and m_sku in ("MED-ASV-01", "MED-ARV-01"):
                        # Critical deficit test case
                        batches_config = [
                            {"batch_no": f"{m_sku[:7]}-PHC-CRIT", "serial_no": f"SN-{f_code}-{m_sku[:7]}-999", "days_to_exp": 90, "qty": 4},
                        ]
                    else:
                        batches_config = [
                            {"batch_no": f"{m_sku[:7]}-PHC-B1", "serial_no": f"SN-{f_code}-{m_sku[:7]}-001", "days_to_exp": 300, "qty": 22},
                        ]
                    if m_sku == "MED-PCM-01":
                        batches_config.insert(0, {"batch_no": f"{m_sku[:7]}-PHC-EXP", "serial_no": f"SN-{f_code}-{m_sku[:7]}-EXP", "days_to_exp": 20, "qty": 10})
                else:  # SC
                    batches_config = [
                        {"batch_no": f"{m_sku[:7]}-SC-B1", "serial_no": f"SN-{f_code}-{m_sku[:7]}-001", "days_to_exp": 180, "qty": 10},
                    ]

                for b in batches_config:
                    exp_date = (today + timedelta(days=b["days_to_exp"])).strftime("%Y-%m-%d")
                    cursor.execute("""
                        INSERT INTO stock_batches (
                            facility_id, medicine_id, gtin, batch_number, serial_number, expiry_date, quantity_available, status, temperature_celsius, thermal_status, version
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 4.2, 'OPTIMAL', 1);
                    """, (f_id, m_id, m_gtin, b["batch_no"], b["serial_no"], exp_date, b["qty"]))
                    batch_id = cursor.lastrowid
                    total_batches += 1

                    record_inventory_transaction(
                        cursor=cursor,
                        facility_id=f_id,
                        facility_gln=f_gln,
                        medicine_id=m_id,
                        gtin=m_gtin,
                        batch_id=batch_id,
                        batch_number=b["batch_no"],
                        serial_number=b["serial_no"],
                        expiry_date=exp_date,
                        transaction_type="RECEIVED",
                        quantity=b["qty"],
                        balance_after=b["qty"],
                        reference_id="INITIAL-SEED-2026",
                        notes="State Medical Depot Inward Supply",
                        logged_by="State Central Store"
                    )
                    total_transactions += 1

        conn.commit()
        print(f"[SUCCESS] Seed complete! Created {len(facility_id_map)} facilities, {len(medicine_id_map)} medicines, {total_batches} stock batches, and {total_transactions} audit transactions.")

    finally:
        conn.close()


if __name__ == "__main__":
    seed_database()
