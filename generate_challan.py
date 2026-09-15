import os
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

def create_crisp_challan():
    width, height = 900, 620
    image = Image.new("RGB", (width, height), color=(253, 252, 248))
    draw = ImageDraw.Draw(image)

    # Load system TrueType fonts if available
    def get_font(size, bold=False):
        font_paths = [
            "C:\\Windows\\Fonts\\calibrib.ttf" if bold else "C:\\Windows\\Fonts\\calibri.ttf",
            "C:\\Windows\\Fonts\\arialbd.ttf" if bold else "C:\\Windows\\Fonts\\arial.ttf",
            "C:\\Windows\\Fonts\\segoeuib.ttf" if bold else "C:\\Windows\\Fonts\\segoeui.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        for p in font_paths:
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
        return ImageFont.load_default()

    font_title = get_font(16, bold=True)
    font_sub = get_font(13, bold=True)
    font_meta = get_font(11, bold=False)
    font_tbl_head = get_font(11, bold=True)
    font_row = get_font(12, bold=False)
    font_stamp_bold = get_font(11, bold=True)
    font_stamp = get_font(9, bold=False)
    font_small = get_font(10, bold=False)

    # Outer decorative borders (Govt register folio style)
    draw.rectangle([(18, 18), (width - 18, height - 18)], outline=(160, 140, 120), width=2)
    draw.rectangle([(22, 22), (width - 22, height - 22)], outline=(200, 185, 170), width=1)

    # Header Bar
    draw.text((35, 30), "GOVERNMENT OF MAHARASHTRA | PUBLIC HEALTH DEPARTMENT", fill=(30, 41, 59), font=font_title)
    draw.text((35, 54), "DISTRICT DRUG WAREHOUSE -> PRIMARY HEALTH CENTRE INWARD DELIVERY CHALLAN", fill=(30, 58, 138), font=font_sub)

    # Metadata Grid Box
    meta_box_top = 82
    meta_box_h = 52
    draw.rectangle([(35, meta_box_top), (width - 35, meta_box_top + meta_box_h)], fill=(248, 250, 252), outline=(203, 213, 225), width=1)
    
    draw.text((48, meta_box_top + 8), "Challan No: DHS-MH-2026/09/8821", fill=(15, 23, 42), font=font_meta)
    draw.text((320, meta_box_top + 8), "Dispatch Date: 05-Sep-2026", fill=(15, 23, 42), font=font_meta)
    draw.text((580, meta_box_top + 8), "Receiving PHC: Kalyanpur PHC (Nashik)", fill=(15, 23, 42), font=font_meta)

    draw.text((48, meta_box_top + 28), "Vehicle / Route: MH-15-EG-4402 (Refrigerated Van)", fill=(71, 85, 105), font=font_meta)
    draw.text((320, meta_box_top + 28), "Temp at Delivery: +3.8 deg C (Compliant)", fill=(5, 150, 105), font=font_meta)
    draw.text((580, meta_box_top + 28), "Storekeeper / Nurse: S. Patil (Reg #N-8841)", fill=(71, 85, 105), font=font_meta)

    # Table Setup
    table_top = 150
    row_height = 42
    col_x = [35, 75, 370, 495, 620, 725, width - 35]

    # Header Background
    draw.rectangle([(col_x[0], table_top), (col_x[-1], table_top + 32)], fill=(224, 231, 255), outline=(147, 197, 253), width=1)

    headers = ["Sr.", "Particulars of Essential Medicine / Drug", "Batch / Lot No.", "Exp. Date", "Qty Recd", "Verification"]
    for i in range(len(headers)):
        draw.text((col_x[i] + 6, table_top + 8), headers[i], fill=(30, 58, 138), font=font_tbl_head)

    # Table Grid lines (vertical dividers in header)
    for x in col_x:
        draw.line([(x, table_top), (x, table_top + 32)], fill=(147, 197, 253), width=1)

    # Rows Data
    rows_data = [
        ("1", "Inj Polyvalent Anti-Snake Venom (ASV) 10ml", "ASV-2026-N8", "31/08/2027", "50 vials", "Verified: S. Patil"),
        ("2", "Anti-Rabies Vaccine (ARV) 0.5ml Inj", "ARV-9942", "30/06/2027", "30 vials", "Verified: S. Patil"),
        ("3", "Oral Rehydration Salts (ORS) 20.5g Pkts", "ORS-4412", "28/02/2028", "250 pkts", "Verified: S. Patil"),
        ("4", "Amoxicillin Capsules 500mg Strip", "AMX-8812", "30/11/2027", "120 strips", "Verified: S. Patil"),
        ("5", "Paracetamol Tablets 500mg Strip", "PCM-2026-Q1", "31/12/2027", "400 strips", "Verified: S. Patil"),
    ]

    current_y = table_top + 32
    for idx, row in enumerate(rows_data):
        row_bg = (255, 255, 255) if idx % 2 == 0 else (248, 250, 252)
        draw.rectangle([(col_x[0], current_y), (col_x[-1], current_y + row_height)], fill=row_bg, outline=(226, 232, 240), width=1)

        # Draw vertical lines
        for x in col_x:
            draw.line([(x, current_y), (x, current_y + row_height)], fill=(226, 232, 240), width=1)

        for i, val in enumerate(row):
            # Blue ballpoint ink simulation
            text_color = (30, 64, 175) if i == 1 else (15, 23, 42)
            draw.text((col_x[i] + 6, current_y + 12), val, fill=text_color, font=font_row)
        current_y += row_height

    # Footer Notes & Official Stamp Section
    footer_top = current_y + 20
    
    # Left: Receiving conditions & certification
    draw.text((38, footer_top), "Receiving Certification & Cold-Chain Protocol:", fill=(30, 41, 59), font=font_tbl_head)
    draw.text((38, footer_top + 18), "1. Biologicals (ASV & ARV) immediately placed in Ice-Lined Refrigerator (ILR-02) at +4 deg C.", fill=(71, 85, 105), font=font_small)
    draw.text((38, footer_top + 34), "2. Consignment outer seals intact: Nil physical damage, zero vial breakage reported.", fill=(71, 85, 105), font=font_small)
    draw.text((38, footer_top + 50), "3. Inward entry verified in Stock Register Page #42, Vol IV.", fill=(71, 85, 105), font=font_small)

    # Right: Official Circular Rubber Stamp & Signatures
    stamp_cx, stamp_cy = 760, footer_top + 45
    draw.ellipse([(stamp_cx - 70, stamp_cy - 40), (stamp_cx + 70, stamp_cy + 40)], outline=(220, 38, 38), width=2)
    draw.ellipse([(stamp_cx - 65, stamp_cy - 36), (stamp_cx + 65, stamp_cy - 36)], outline=(239, 68, 68), width=1)
    draw.text((stamp_cx - 48, stamp_cy - 26), "MEDICAL OFFICER", fill=(185, 28, 28), font=font_stamp_bold)
    draw.text((stamp_cx - 55, stamp_cy - 10), "PRIMARY HEALTH CENTRE", fill=(185, 28, 28), font=font_stamp)
    draw.text((stamp_cx - 40, stamp_cy + 6), "KALYANPUR - NASHIK", fill=(185, 28, 28), font=font_stamp)
    draw.text((stamp_cx - 30, stamp_cy + 20), "05 SEP 2026", fill=(185, 28, 28), font=font_stamp)

    # Signature line
    draw.line([(530, footer_top + 68), (640, footer_top + 68)], fill=(71, 85, 105), width=1)
    draw.text((540, footer_top + 72), "Pharmacist Sign", fill=(100, 116, 139), font=font_small)

    # Save to artifact and return bytes
    artifact_path = r"C:\Users\chand\.gemini\antigravity-ide\brain\8571d69e-9862-4723-a499-773e525ae162\sample_chalan.png"
    image.save(artifact_path, format="PNG")
    
    # Also return bytes
    buf = BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()

if __name__ == "__main__":
    b = create_crisp_challan()
    print(f"Created 900x620 crisp challan, size: {len(b)} bytes")
