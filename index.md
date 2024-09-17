---
layout: home
title: "Welcome to My Site"
---
# Welcome to My Blog

---

---
layout: post
title: "Rooting the Nothing Phone (1) and Uninstalling System Apps"
date: 2024-09-18
---
# Getting Back Control of My Life

I am definitely addicted to YouTube Shorts, Instagram Reels, and other similar platforms. I managed to uninstall all apps and delete all social media accounts except for YouTube. While I love YouTube, I hate how short-form videos destroy my attention span. For this reason, I want to remove the native YouTube app and install YouTube ReVanced.

I considered using an app blocker to disable the original YouTube app while still using ReVanced, but that approach didn’t work for me in the past. It was too easy to simply disable the app blocker. Instead, I decided to completely remove the original app and replace it with the ReVanced version, which offers the functionality to disable Shorts.

To achieve this, I rooted my Nothing Phone (1) to uninstall the original YouTube app. My procedure differs from those found online as I avoid relying on any shady pre-built images. Instead, I download the original OTA update, extract the boot image, patch it with Magisk, and flash it back to the phone. This procedure should work with most Android phones, but I have only tested it with the Nothing Phone.

## ⚠️ Warning: Data Reset and 2FA Considerations

- **Rooting Your Phone**: This process will likely trigger a factory reset, erasing all data on your device, including apps, photos, messages, and settings. **Ensure you have a full backup** of your data before proceeding.
  
- **2-Factor Authentication (2FA)**: After rooting, you may encounter issues signing back into your Google account if SMS-based 2FA is not working. In my case, SMS-based 2FA did not work, preventing me from logging in.
  
  - **Important**: It is strongly recommended to activate **backup codes** for your Google account’s 2FA before proceeding with the rooting process. These backup codes will allow you to sign in even if SMS 2FA is unavailable. You can generate backup codes from your Google Account settings under **Security > 2-Step Verification > Backup Codes**.

Proceed with caution and ensure you have both backups of your data and alternate 2FA methods ready before rooting your device.

---

## Prerequisites

1. **ADB & Fastboot**: Install ADB and Fastboot on your computer.
   - **On Ubuntu**:
     `sudo apt install android-tools-adb android-tools-fastboot`
   - **On Windows**: Download and install the [ADB & Fastboot](https://developer.android.com/studio/releases/platform-tools) tools.

2. **Magisk**: Download the latest APK of Magisk from [here](https://github.com/topjohnwu/Magisk/releases).

3. **USB Debugging**: Enable USB debugging on your Nothing Phone (1).
   - **Enable Developer Options**:
     1. Open **Settings** on your phone.
     2. Scroll down and tap on **About Phone**.
     3. Find the **Build Number** and tap it **7 times**. You should see a message indicating that Developer Options are enabled.
   
   - **Enable USB Debugging**:
     1. Go back to **Settings**.
     2. Navigate to **System** > **Developer Options**.
     3. Scroll down and toggle **USB Debugging** to **On**.
     4. Confirm any prompts that appear.

4. **Verify ADB Connection**:
   `adb devices`
   - **Expected Output**: A list of devices attached, along with a serial number.
   - **If you see "unauthorized"** next to your device, check your phone for a pop-up notification and **allow USB debugging** by tapping **"Allow"**.

---

## Step 1: Unlock the Bootloader

Unlocking the bootloader is essential to flash custom ROMs and kernels on your device.

1. **Reboot into Bootloader Mode**:
   `adb reboot bootloader`
   - Your phone will reboot into Fastboot mode. You should see the "Nothing" logo along with some text.

2. **Unlock the Bootloader**:
   `fastboot flashing unlock`
   - **On Your Phone**: A prompt will appear asking you to confirm the bootloader unlock.
     - Use the **Volume Keys** to navigate to **"Unlock the bootloader"**.
     - Press the **Power Button** to confirm.
   - **Important**: This action will **erase all data** on your device and delete all updates, which is necessary for the next steps.

3. **Reboot Your Device**:
   `fastboot reboot`
   - Your phone will reboot, and you'll need to set it up again as it has been reset to factory settings.

---

## Step 2: Download OTA and Extract Boot Image

After unlocking the bootloader and resetting your device, you need to download the latest OTA update to access the boot image.

1. **Re-enable Developer Options and USB Debugging**:
   - **Enable Developer Options**:
     1. Open **Settings**.
     2. Go to **About Phone**.
     3. Tap **Build Number** 7 times to enable Developer Options.
   
   - **Enable USB Debugging**:
     1. Navigate to **Settings** > **System** > **Developer Options**.
     2. Toggle **USB Debugging** to **On**.
     3. Confirm any prompts that appear.

2. **Download the Full OTA Package**:
   
   - **Start Capturing Syslogs**:
     `adb logcat > ota_log.txt`
     - This command will start logging all system messages to `ota_log.txt` on your computer.
   
   - **Initiate OTA Update Download**:
     1. On your phone, go to **Settings** > **System** > **System Update**.
     2. Tap the **"Check for Update"** or **"Update"** button.
     3. The phone will begin downloading the latest OTA update. **Do not proceed to install it yet**.

   - **Stop Capturing Syslogs After Download Completes**:
     - Once the OTA update has finished downloading (you'll see a notification), stop the log capture by pressing `Ctrl + C` in the terminal.

   - **Capture the OTA Download URL**:
     `grep "https://android.googleapis.com" ota_log.txt`
     - This command filters the log to find the OTA download URL.

   - **Reboot to Install the Update**:
     `adb reboot`
     - **Important**: Do **not** proceed immediately. You need to download the OTA package manually first.

   - **Download the OTA Package**:
     - Open the terminal and use `wget` to download the OTA package using the URL you extracted:
       `wget https://android.googleapis.com/[path_to_ota_package]`
     - Alternatively, you can paste the URL into your browser to download the OTA package.

3. **Extract the `boot.img`**:
   
   - **Unzip the Downloaded OTA Package**:
     `unzip package_name.zip`
   
   - **Extract `boot.img` from `payload.bin` Using `payload-dumper-go`**:
     `git clone https://github.com/ssut/payload-dumper-go`
     `cd payload-dumper-go`
     `sudo apt install golang`
     `go build`
     `./payload-dumper-go /path/to/payload.bin`
     - Replace `/path/to/payload.bin` with the actual path to your `payload.bin` file.
     - The extracted `boot.img` will be available in the output directory.

---

## Step 3: Patch the Boot Image with Magisk

Magisk allows you to gain root access without modifying the system partition.

1. **Transfer `boot.img` to Your Phone**:
   - Use a USB cable or any preferred method to copy the extracted `boot.img` to your phone's storage.

2. **Open the Magisk App**:
   - Launch the **Magisk** app on your phone.

3. **Install Magisk**:
   - Tap on **"Install"**.
   - Select **"Select and Patch a File"**.
   - Navigate to and select the `boot.img` you transferred earlier.
   
4. **Wait for Magisk to Patch the Boot Image**:
   - Magisk will process the `boot.img` and create a patched version, typically named `magisk_patched.img`.

5. **Transfer the Patched Boot Image Back to Your Computer**:
   - Connect your phone to your computer and copy the `magisk_patched.img` from your phone to your computer.

---

## Step 4: Flash the Patched Boot Image

Flashing the patched boot image integrates Magisk into your system, granting root access.

1. **Reboot Your Phone into Fastboot Mode**:
   
   - **Using ADB**:
     `adb reboot bootloader`
   
   - **Manually**:
     1. Power off your device.
     2. Press and hold the **Volume Down** and **Power** buttons simultaneously until the Fastboot screen appears.

2. **Flash the Patched Boot Image**:
   `fastboot flash boot /path/to/magisk_patched.img`
   - Replace `/path/to/magisk_patched.img` with the actual path to your patched boot image.

3. **Reboot Your Device**:
   `fastboot reboot`
   - Your phone will reboot with Magisk installed, granting you root access.

---

## Step 5: Uninstall System Apps

With root access, you can now remove unwanted system apps like the native YouTube app.

1. **Connect Your Phone to Your Computer**:
   - Ensure that USB Debugging is still enabled.

2. **Open an ADB Shell**:
   `adb shell`

3. **List All Installed Packages**:
   `pm list packages`
   - Review the list to identify the package name of the app you want to uninstall (e.g., `com.google.android.youtube`).

4. **Uninstall the Desired App**:
   `pm uninstall -k --user 0 com.google.android.youtube`
   - Replace `com.google.android.youtube` with the actual package name of the app you wish to remove.

   - **Explanation**:
     - `pm uninstall`: Command to uninstall a package.
     - `-k`: Keeps the data and cache directories after the package removal.
     - `--user 0`: Uninstalls the app for the current user.

---

## Step 6: Install YouTube ReVanced

*To Do*: Provide detailed steps for installing YouTube ReVanced.

*Note*: Ensure you follow the latest guides or official sources for installing YouTube ReVanced, as methods may vary or update over time.

---

## Conclusion

By following these detailed steps, you should have successfully rooted your Nothing Phone (1) and uninstalled system apps. Remember to proceed with caution and ensure you have backups of your data and alternate 2FA methods ready before rooting your device. Enjoy your newfound freedom from pre-installed bloatware and system apps!
