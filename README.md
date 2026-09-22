# Accidiox — two-wheeler crash black box and ambulance dispatch

**Live: [accidiox.codingtechnyks.com](https://accidiox.codingtechnyks.com)**
Built for the KAYA Buildathon, IIT (BHU) Varanasi — Problem Statement 01, Open Innovation.

A rider crashes. Nobody calls anyone. Within a minute, the nearest hospitals
see the crash on a dispatch console with the rider's blood group and
allergies, one of them assigns an ambulance, the crew accepts on their phone,
and the rider's family gets a WhatsApp message and an automatic phone call
with the live location.

That whole chain runs today, on a ₹1,200 sensor box and four apps.

## Try it

| App | Link | Who it's for |
| :--- | :--- | :--- |
| Rider app | [/](https://accidiox.codingtechnyks.com) | The rider. Pairs with the box, detects the crash, runs the cancel window. |
| Hospital console | [/hospital_dashboard.html](https://accidiox.codingtechnyks.com/hospital_dashboard.html) | Emergency desk: accept a crash, assign an ambulance, track it in. |
| Ambulance crew app | [/ambulance.html](https://accidiox.codingtechnyks.com/ambulance.html) | The crew: accept within 60 s, navigate, move the case forward. |
| Owner console | [/admin.html](https://accidiox.codingtechnyks.com/admin.html) | Accidiox support: approve hospitals and crews, close false alarms. |

The rider and crew apps install as Android apps
([APK downloads](https://accidiox.codingtechnyks.com/downloads/accidiox-rider.apk)),
and every app is a PWA you can add to a home screen.

## How it works

```
 ESP32 + MPU-6050  ──BLE──►  Rider app (PWA)  ──HTTPS──►  PHP / MySQL backend
   on the bike                 crash + cancel                    │
                                                                 ├─► 3 nearest VERIFIED hospitals  ─► hospital console
                                                                 ├─► WhatsApp to family (Meta API)
                                                                 ├─► automatic voice call (Twilio)
                                                                 └─► email to the alerted hospitals
                                                                        │
                                             ambulance crew app  ◄──────┘  assign → accept (60 s) → en route → admitted
```

**The crash rules.** Tilt past the threshold must hold for 10 continuous
seconds; then the rider has 20 seconds to cancel with one tap. Only after
that does anything leave the phone.

**The dispatch rules.** The first hospital to claim a crash owns it, and the
rest are locked out. A crew that doesn't accept within 60 seconds loses the
dispatch. A claim with no accepting crew for 5 minutes goes back to the other
nearby hospitals. A rider who is hurt and untreated cannot cancel the
ambulance. A case nobody answers can be closed by the Accidiox support team
from the owner console, which clears it from every app at once.

**Privacy.** Medical details reach a hospital only after a confirmed crash,
and only a hospital that Accidiox has verified. API keys and credentials
live on the server only, never in this repository.

## Repository layout

| Path | What's in it |
| :--- | :--- |
| [`firmware/esp32_blackbox_industrial`](firmware/esp32_blackbox_industrial) | Production ESP32 firmware — the one to flash. |
| [`firmware/blackbox_gsm_standalone`](firmware/blackbox_gsm_standalone) | Variant with onboard 4G + GPS, for a box that works without the rider's phone. |
| [`firmware/legacy_prototypes`](firmware/legacy_prototypes) | Earlier OLED prototypes, kept for history. |
| [`web_app`](web_app) | The four apps and the PHP/MySQL backend. See [`web_app/README.md`](web_app/README.md). |
| [`web_app/api`](web_app/api) | REST endpoints; shared core in [`api/lib/bootstrap.php`](web_app/api/lib/bootstrap.php). |
| [`docs`](docs) | Pitch deck outline, demo-video and pitch guide, screenshots. |
| [`tools`](tools) | Small build scripts (Markdown → PDF for the guides). |
| [`media`](media) | Demo video. |

Deep-dive on the algorithm, the BLE GATT contract, the database schema and the
pinout: **[PROJECT_MASTER_DOCUMENTATION.md](PROJECT_MASTER_DOCUMENTATION.md)**.

## Run it yourself

**Firmware.** Open `firmware/esp32_blackbox_industrial/esp32_blackbox_industrial.ino`
in the Arduino IDE, install the libraries listed in the file header, flash an
ESP32 wired to an MPU-6050 over I2C.

**Backend.** Copy `web_app` into a PHP 8 + MySQL server root (XAMPP works),
then create the config files from their examples:

```
cd web_app/api
cp db_config.example.php        db_config.php        # database credentials
cp email_config.example.php     email_config.php     # SMTP, for hospital mail
cp twilio_voice_config.example.php twilio_voice_config.php   # voice calls
cp meta_whatsapp_config.example.php meta_whatsapp_config.php # WhatsApp
cp geoapify_config.example.php  geoapify_config.php  # maps and geocoding
```

The tables build themselves on the first request. Open `index.html`, create a
rider account, and `hospital_dashboard.html` for a hospital account. A new
hospital waits for approval — approve it from the owner console at
`admin.html`, whose first run asks for the database password as a one-time
setup key.

Without the Twilio, Meta and Geoapify keys everything still runs; those
channels just report that they're not configured.

## Hardware

| Part | Approx cost |
| :--- | :--- |
| ESP32 dev module | ₹420 |
| MPU-6050 6-axis IMU | ₹140 |
| Buzzer, LEDs, wiring, enclosure, regulator | ₹600 |
| **Total** | **under ₹1,200** |

## Honest status

Working end-to-end prototype, deployed and in use for demos.

- Crash detection is tested on controlled drops of a real two-wheeler, not on
  a large crash dataset.
- The current box needs the rider's phone for GPS and internet; the
  phone-free 4G variant is firmware-complete but not field-tested.
- Voice calls run on a Twilio trial account, so they reach verified numbers
  only until the account is upgraded.
- The hospital network is the hard part, not the code. Next step is a signed
  pilot with one hospital in Guwahati.

## Licence and team

Built by team Technyks for KAYA 2026. Ask before reusing the hospital
dispatch protocol commercially.
