# Setting Up Multi-Factor Authentication (MFA)

## What is MFA?

Multi-Factor Authentication adds an extra layer of security to your Contoso account. After entering your password, you'll also need to approve a prompt on your phone. All Contoso employees are required to use MFA.

## Initial Setup

If you're setting up MFA for the first time (new starter or new phone):

1. Go to [https://aka.ms/mfasetup](https://aka.ms/mfasetup)
2. Sign in with your Contoso email and password
3. Select **Mobile app** as your verification method
4. Choose **Receive notifications for verification**
5. Open the **Microsoft Authenticator** app on your phone
   - If you don't have it, download it from the App Store (iOS) or Google Play (Android)
6. In the Authenticator app, tap **+** → **Work or school account** → **Scan QR code**
7. Scan the QR code shown on your computer screen
8. Approve the test notification that appears on your phone
9. Click **Done**

## Day-to-Day Use

When signing into Microsoft 365, VPN, or any Contoso app:

1. Enter your email and password as normal
2. A notification appears on your phone — tap **Approve**
3. If asked for a number, match the number shown on your computer screen and tap it in the Authenticator app

## Switching to a New Phone

1. Install Microsoft Authenticator on your new phone
2. Go to [https://aka.ms/mfasetup](https://aka.ms/mfasetup) on a computer
3. Under **Default sign-in method**, click **Change**
4. Re-register the Authenticator app by scanning a new QR code
5. Once verified, remove the old phone from your registered devices

**Important:** Set up MFA on your new phone BEFORE wiping or returning your old phone.

## Troubleshooting

### "No notification received"

- Check that your phone has an internet connection (Wi-Fi or mobile data)
- Open the Authenticator app — sometimes the notification arrives inside the app but not as a push notification
- Check that notifications are enabled for Microsoft Authenticator in your phone settings
- If you still don't receive it, select **"I can't use my Microsoft Authenticator app right now"** and use the one-time code shown in the Authenticator app instead

### "Authenticator app shows an error"

- Force-close the Authenticator app and reopen it
- Ensure your phone's date/time is set to automatic
- If the error persists, remove your Contoso account from the app and re-register at [https://aka.ms/mfasetup](https://aka.ms/mfasetup)

### Locked out of your account

If you cannot sign in at all and MFA is not working:

1. Ask a colleague to contact IT Support on your behalf, or
2. Call the IT Support desk directly at extension 4400
3. IT will verify your identity and issue a temporary access pass

## Contact

If you need help setting up or troubleshooting MFA, contact IT Support through the IT Help Desk agent in Teams.
