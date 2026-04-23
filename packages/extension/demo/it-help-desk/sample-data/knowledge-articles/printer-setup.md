# Printer Setup and Troubleshooting

## Finding Your Office Printer

Each Contoso office has shared network printers. Your laptop should automatically discover them when connected to **Contoso-Corp** Wi-Fi or ethernet.

### Printer Locations

| Office     | Floor | Printer Name | Location                     |
| ---------- | ----- | ------------ | ---------------------------- |
| London     | 2     | LDN-F2-HP01  | Near lift lobby              |
| London     | 3     | LDN-F3-HP01  | Open plan area, east wall    |
| London     | 4     | LDN-F4-HP01  | Near meeting room Canary     |
| Manchester | 3     | MAN-F3-HP01  | Hot desk area, centre        |
| Manchester | 5     | MAN-F5-HP01  | Near meeting room Deansgate  |
| Edinburgh  | 1     | EDI-F1-HP01  | Reception area               |
| Edinburgh  | 2     | EDI-F2-HP01  | Open plan area, near kitchen |

## Adding a Printer (Windows)

1. Open **Settings** → **Bluetooth & devices** → **Printers & scanners**
2. Click **Add device**
3. Wait for the printer to appear in the list (e.g. LDN-F2-HP01)
4. Click **Add device** next to the printer name
5. Try printing a test page

If the printer does not appear:

- Make sure you are connected to **Contoso-Corp** (not Contoso-Guest)
- Restart your laptop and try again
- If still missing, contact IT Support

## Adding a Printer (Mac)

1. Open **System Settings** → **Printers & Scanners**
2. Click **Add Printer, Scanner, or Fax**
3. The printer should appear under the **IP** or **Bonjour** tab
4. Select it and click **Add**
5. Try printing a test page

## Printing from Mobile Devices

Mobile printing is not directly supported. To print from a phone or tablet:

1. Email the document to yourself
2. Open it on your Contoso laptop
3. Print from the laptop

## Common Issues

### Paper jam

1. Open the front panel of the printer
2. Gently pull out any stuck paper — pull in the direction of the paper path, not backwards
3. Close the panel and wait for the printer to reset
4. If the jam persists, check the rear panel and paper tray
5. If you cannot clear it, create an IT Support ticket with the printer name and location

### Print job stuck in queue

1. Open **Settings** → **Bluetooth & devices** → **Printers & scanners**
2. Select the printer → **Open print queue**
3. Right-click the stuck job → **Cancel**
4. Try printing again
5. If the queue keeps sticking, restart the Print Spooler service:
   - Open Command Prompt as Administrator
   - Run: `net stop spooler && net start spooler`

### "Access denied" or "Driver unavailable"

This usually means your laptop doesn't have the printer driver. Contact IT Support to have the driver pushed to your machine.

### Poor print quality

- Check the toner level (displayed on the printer's screen)
- If toner is low, create an IT Support ticket requesting a replacement
- Try printing from a different application to rule out software issues

## Ordering Supplies

Toner and paper are managed by Facilities. If a printer is low on toner or paper:

- **Paper:** Supplies are in the stationery cupboard on each floor. Refill the tray yourself if possible.
- **Toner:** Create an IT Support ticket with the printer name. IT will coordinate with Facilities for replacement.

## Contact

For printer issues not covered here, contact IT Support through the IT Help Desk agent in Teams.
