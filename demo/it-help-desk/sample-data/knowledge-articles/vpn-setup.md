# How to Connect to Contoso VPN

## Overview

All Contoso employees can access the corporate network remotely using GlobalProtect VPN. This guide covers setup and common troubleshooting steps.

## Prerequisites

- A Contoso-issued laptop with GlobalProtect pre-installed
- Your Contoso email address and password
- Microsoft Authenticator app configured for MFA

## Connection Steps

1. Open the **GlobalProtect** application from your system tray (Windows) or menu bar (Mac)
2. Enter the portal address: `vpn.contoso.com`
3. Click **Connect**
4. Enter your Contoso email address and password when prompted
5. Approve the MFA push notification on your Microsoft Authenticator app
6. Wait for the status to show **Connected**

The VPN icon in your system tray/menu bar will turn green when connected.

## Disconnect

Click the GlobalProtect icon in your system tray/menu bar and select **Disconnect**.

## Troubleshooting

### "Portal address is not reachable"

- Check that you have an active internet connection (try opening a website)
- Restart your Wi-Fi or switch to a wired connection
- If on a public network (hotel, airport), the network may block VPN ports — try using a mobile hotspot instead

### "Authentication failed"

- Double-check your Contoso email address and password
- Make sure you are approving the correct MFA prompt (check the number matches)
- If your password recently changed, use the new password
- If your account is locked, contact IT Support

### "Connected but cannot access internal sites"

- Disconnect and reconnect the VPN
- Clear your browser cache
- Try accessing the site in a private/incognito browser window
- If the issue persists, restart your laptop and reconnect

### VPN is slow

- Close bandwidth-heavy applications (video streaming, large downloads)
- Try connecting to a different network
- If working from Edinburgh or Manchester, ensure you're connecting to `vpn.contoso.com` (not a legacy address)

## Supported Platforms

| Platform | Version | Notes                                    |
| -------- | ------- | ---------------------------------------- |
| Windows  | 10, 11  | Pre-installed on all Contoso laptops     |
| macOS    | 12+     | Pre-installed on all Contoso MacBooks    |
| iOS      | 15+     | Install GlobalProtect from the App Store |
| Android  | 12+     | Install GlobalProtect from Google Play   |

## Contact

If you cannot resolve the issue with these steps, contact IT Support through the IT Help Desk agent in Teams.
