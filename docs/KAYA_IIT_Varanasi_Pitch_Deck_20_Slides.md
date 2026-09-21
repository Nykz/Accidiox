# ACCIDIOX — 20-SLIDE WIDESCREEN (16:9) PITCH DECK
### KAYA Buildathon 2026 | IIT (BHU) Varanasi — Hardware Track

---

## VISUAL IDENTITY & COLOR PALETTE
- **Background (Dark Slides):** #071822 (Deep KAYA Navy)
- **Background (Light Slides):** #FFFFFF / #F8FAFC (Clean Modern White / Soft Tint)
- **Primary Text (Dark Slides):** #F4EEE2 (Warm Cream)
- **Primary Text (Light Slides):** #0F172A (Slate 900)
- **Secondary Text:** #B9B0A2 (Muted Tan) / #64748B (Slate 500)
- **Accent Highlight / CTAs:** #F0A143 (Burnt Orange)
- **Card Background (Dark):** #0F2432 / gba(240, 161, 67, 0.08)
- **Card Background (Light):** #F1F5F9 with subtle border #E2E8F0

---

## SLIDE 1: TITLE SLIDE (Dark)
- **Slide Type:** Dark (#071822)
- **Badge:** [KAYA BUILDATHON 2026 — IIT (BHU) VARANASI | HARDWARE TRACK]
- **Hero Title:** **ACCIDIOX**
- **Subtitle:** AI-Assisted Crash Detection & Automatic Emergency Response for Two-Wheelers
- **Tagline:** *Democratizing Superbike Safety & Autonomous Life-Saving Telematics for Every Commuter*
- **Visual:** Clean 3D exploded render of the blackbox ECU + Handlebar Remote + Smartphone Telematics Link
- **Footer:** Team Name & Contact Placeholder

---

## SLIDE 2: EXECUTIVE AGENDA (Dark)
- **Slide Type:** Dark (#071822)
- **Header:** **Roadmap & Presentation Flow**
- **Cards Grid (9-Step Progression):**
  1. **The Problem** → Real-world Indian road fatality numbers (MoRTH 2023)
  2. **The Solution** → Universal hardware blackbox + intelligent emergency pipeline
  3. **System Architecture** → End-to-end 20-second sensor-to-dispatch flow
  4. **The Hardware** → ESP32 + MPU-6050 + 3-Button Remote + GATT BLE
  5. **Live Rider App** → 3D Three.js digital-twin dashboard & PWA
  6. **Spatial Intelligence** → GPS + Geoapify nearest trauma care discovery
  7. **WhatsApp Integration** → Meta Cloud API automated dispatch (Zero taps)
  8. **Fleet Command Center** → Real-time multi-rider admin portal & incident mapping
  9. **Challenges & Future Scope** → GSM fallback, edge ML, and production roadmap

---

## SLIDE 3: THE PROBLEM — THE NUMBERS (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **The Silent Crisis on Indian Roads**
- **Stat Callout 1 (Large Stat):** **1,72,890**  
  *Lives lost to road accidents in India in 2023.*
- **Stat Callout 2 (Large Stat):** **44.8%**  
  *Of all road fatalities are two-wheeler riders — the highest of any vehicle category.*
- **Stat Callout 3 (Large Stat):** **20 Deaths Every Hour**  
  *Occurring continuously across the country.*
- **Source Citation:** *Source: Ministry of Road Transport & Highways (MoRTH), Road Accidents in India 2023.*
- **Visual Card:** Breakdown chart showing Two-Wheelers (44.8%) vs Cars (14.2%) vs Trucks (10.7%).

---

## SLIDE 4: THE PROBLEM — WHAT IT LOOKS LIKE (Dark)
- **Slide Type:** Dark (#071822)
- **Header:** **The Solitary Rider Dilemma & The Lost Golden Hour**
- **Core Insight:** *Most fatal crashes happen when a rider is alone — unconscious on a quiet road, with no one around to call for help.*
- **Key Realities:**
  - Emergency services receive notification 45–90 minutes post-crash (long after the 60-minute Golden Hour has passed).
  - Family members have zero visibility into their loved one's distress or exact location.
- **Visual:** High-resolution photograph of a motorcycle fallen on an Indian highway shoulder at twilight (non-graphic), highlighting isolation and vulnerability.

---

## SLIDE 5: WHY THIS STILL HAPPENS (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **The Existing Safety Gap in the Two-Wheeler Market**
- **Comparison Table / Cards:**
  - **Manual SOS Apps:** Require the rider to be conscious, unlock their phone, and press a button — *Fails when rider is unconscious or phone is thrown.*
  - **Smartwatch Fall Detection:** Expensive (₹25,000+), drains battery in 18 hours, produces high false positives from arm gestures.
  - **Luxury Superbike eCall (BMW/Ducati):** Exclusive to ₹20+ Lakh superbikes; unavailable to 99% of commuter riders (Splendor, Pulsar, Activa).
- **Accidiox Positioning:** **Purpose-built, low-cost (₹1,200) retrofit hardware with autonomous sensor-triggered emergency response — Zero rider action required.**

---

## SLIDE 6: OUR SOLUTION (Dark)
- **Slide Type:** Dark (#071822)
- **Header:** **A Blackbox for Every Two-Wheeler**
- **Positioning Statement:** *Detects the crash. Gives the rider a chance to cancel. Dispatches help automatically.*
- **Four Core Pillars (Icon Grid):**
  1. **Autonomous Crash Detection:** 3D Vector Gravity Dot-Product IMU algorithm detects true ground falls (>85°).
  2. **Zero False Alarms:** 20-second safety window with loud siren & 1-click handlebar remote cancel.
  3. **Multi-Channel Emergency Dispatch:** Automated Meta WhatsApp Cloud API alert with live GPS, street address, and nearest hospital.
  4. **Fleet Visibility:** Centralized Web Command Center for live telemetry and scientific incident investigation.

---

## SLIDE 7: SYSTEM ARCHITECTURE (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **End-to-End System Architecture (~20s Crash-to-Dispatch)**
- **Flowchart / Block Diagram:**
  [1. Hardware ECU (ESP32 + MPU-6050)]  
  &nbsp;&nbsp;&nbsp;&nbsp;↓ *(BLE GATT Notification CRASH)*  
  [2. Rider Mobile App (PWA / Android TWA)]  
  &nbsp;&nbsp;&nbsp;&nbsp;↓ *(20-Second Audio Siren & Handlebar Cancel Window)*  
  [3. Spatial Intelligence Engine (GPS + Geoapify Places & Geocoding)]  
  &nbsp;&nbsp;&nbsp;&nbsp;↓ *(Nearest Hospital + Live Google Maps Link)*  
  [4. Cloud Dispatch Server (PHP / MySQL / Meta WhatsApp Cloud API)]  
  &nbsp;&nbsp;&nbsp;&nbsp;↓ *(Zero-Tap Autonomous Message Delivery)*  
  [5. Emergency Contacts / Hospital / Police / Fleet Admin]
- **Total Pipeline Execution:** **~20 Seconds from impact to verified emergency dispatch.**

---

## SLIDE 8: THE HARDWARE (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **Industrial Retrofit Hardware Assembly**
- **Hardware Breakdown:**
  - **Microcontroller:** ESP32 Dev Module (Dual-core 240MHz, BLE 4.2 GATT Server).
  - **Motion Core:** MPU-6050 6-Axis IMU (I2C SDA:21, SCL:22) with 3D vector gravity calculation.
  - **Audio-Visual Beacon:** Dedicated active buzzer (GPIO 4) + High-intensity hazard strobe LED (GPIO 19).
  - **Handlebar 3-Button Remote:** Tactile IP65 switches (GPIO 32, 33, 25) for media control & false alarm cancellation.
- **Visual:** High-res photo of the assembled ESP32 + MPU-6050 + Buzzer + LED + 3-Button prototype with callout labels.

---

## SLIDE 9: THE RIDER APP — HOME SCREEN (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **Cockpit Dashboard & Rider Telematics**
- **Key Features:**
  - **Live Digital-Twin 3D View:** Real-time Three.js motorcycle model with road animation and speed synchronization.
  - **Telematics Metrics:** Speedometer, ride duration counter, GPS coordinate stream, and connection status badge.
  - **Nearest Emergency Facilities:** Live cards showing closest verified hospital, police station, and fuel pump.
- **Visual:** Screenshot of index.html running in mobile view inside a modern smartphone frame.

---

## SLIDE 10: THE RIDER APP — SETTINGS & DIAGNOSTICS (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **Safety Configuration & Hardware Diagnostics**
- **Key Modules:**
  - **Emergency Contact Manager:** Configures primary and secondary SOS phone numbers for WhatsApp dispatch.
  - **Handlebar Remote Diagnostics:** Live visual feedback indicator for physical button presses (Vol+, Play/Pause, Vol-).
  - **Bluetooth Connection Manager:** Manual connect/disconnect with auto-reconnect telemetry engine.
- **Visual:** Screenshot of the Settings screen showing contact input cards and remote testing widgets.

---

## SLIDE 11: THE 3D LIVE DIGITAL TWIN (Dark)
- **Slide Type:** Dark (#071822)
- **Header:** **Three.js Powered 3D Digital Twin**
- **Technical Highlights:**
  - **Speed-Driven Motion:** Wheel rotation rate and asphalt scroll speed dynamically driven by real-time GPS telemetry.
  - **Model Customization:** Modular GLTF model loader supporting Superbike (Yamaha R1) and Commuter Scooter (Vespa).
  - **Lightweight WebGL Pipeline:** Fully optimized for low-power mobile browsers with zero gyro-lag overhead.
- **Visual:** Close-up rendered screenshot of the Yamaha YZF-R1 3D model running in the cockpit dashboard.

---

## SLIDE 12: SPATIAL LOCATION INTELLIGENCE (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **Precision GPS & Geoapify Geospatial Pipeline**
- **Three-Tier Spatial Resolution:**
  1. **High-Accuracy GPS:** Captures sub-5m latitude/longitude coordinates via HTML5 Geolocation API.
  2. **Human-Readable Reverse Geocoding:** Geoapify API resolves coordinates into exact Street, Neighborhood, Landmark, and City names (no raw confusing numbers for family).
  3. **Autonomous Facility Discovery:** Geoapify Places API dynamically locates and ranks the nearest Trauma Care Hospital and Police Station within a 5km radius.
- **Visual:** Visual map callout displaying a pinpointed location with nearest hospital card, distance in meters, and direct Google Maps navigation link.

---

## SLIDE 13: AUTOMATIC WHATSAPP DISPATCH — ARCHITECTURE (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **Meta WhatsApp Business Cloud API Integration**
- **Why Meta Cloud API (Not Click-to-Chat):**
  - Standard wa.me links require an unlocked phone, user interaction, and a manual press on the Send button — *Impossible if the rider is unconscious.*
  - Accidiox integrates directly with **Meta's official WhatsApp Business Cloud API** on the backend server.
  - The server dispatches the emergency payload autonomously over HTTPS.
- **Visual:** Screenshot of Meta for Developers Dashboard showing Verified Phone Number ID, WhatsApp Business Account ID, and Cloud API setup.

---

## SLIDE 14: APPROVED WHATSAPP TEMPLATE (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **Meta-Approved crash_alert Template**
- **Compliance & Reliability:**
  - Meta strictly requires pre-approved templates for business-initiated emergency broadcasts.
  - Template crash_alert is officially **APPROVED** with parameters for Rider Name, Incident Time, Street Location, Google Maps URL, and Nearest Hospital.
- **Visual:** Screenshot of Meta WhatsApp Manager showing the approved crash_alert template status and parameter mapping.

---

## SLIDE 15: THE DELIVERED EMERGENCY DISPATCH (Dark)
- **Slide Type:** Dark (#071822)
- **Header:** **Zero Taps. Immediate Life-Saving Delivery.**
- **Delivered Message Anatomy:**
  - 🚨 **CRITICAL ACCIDENT ALERT:** *Accidiox detected a severe two-wheeler collision involving [Rider Name].*
  - 📍 **Exact Incident Location:** Street Name, Landmark, City.
  - 🗺️ **Live Navigation Link:** Clickable Google Maps URL.
  - 🏥 **Nearest Medical Care:** Hospital Name, Distance, Emergency Contact.
  - ⏱️ **Timestamp:** Exact millisecond crash log.
- **Visual:** Full screenshot of the actual WhatsApp SOS message received on an emergency contact's smartphone.

---

## SLIDE 16: FLEET COMMAND CENTER (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **Admin Portal & Incident Reconstruction**
- **Enterprise & Police Features:**
  - **Live Geospatial Incident Map:** Interactive Leaflet.js dashboard tracking active vehicles and crash locations.
  - **Accident Log Matrix:** Comprehensive table recording timestamps, verified coordinates, speeds, and rider outcomes.
  - **Telemetry Timeline:** Historical sensor log for insurance claim verification and police accident reconstruction.
- **Visual:** Screenshot of dmin.html showing the dark glassmorphic command center, interactive map pins, and incident log table.

---

## SLIDE 17: FULL TECH STACK BREAKDOWN (Light)
- **Slide Type:** Light (#FFFFFF)
- **Header:** **Robust, Production-Ready Technology Stack**
- **3-Column Architecture:**
  - **Hardware Layer:**
    - ESP32 Dev Module (C++ / FreeRTOS)
    - MPU-6050 6-Axis IMU (I2C Direct Register Access)
    - Custom BLE 4.2 GATT Telemetry Server
    - IP65 Handlebar Remote + Strobe & Buzzer
  - **Frontend & PWA Layer:**
    - HTML5, Modern CSS3 Glassmorphism
    - Three.js 3D WebGL Digital Twin
    - Leaflet.js Geospatial Mapping
    - Web Bluetooth API (GATT Client with auto-reconnect)
  - **Cloud & Backend Layer:**
    - PHP 8.x REST API + MySQL Database
    - Meta WhatsApp Business Cloud API
    - Geoapify Geocoding, Places & Routing APIs
    - Trusted Web Activity (TWA) Android APK

---

## SLIDE 18: CHALLENGES SOLVED & INNOVATIONS (Dark)
- **Slide Type:** Dark (#071822)
- **Header:** **Engineering Challenges & Practical Solutions**
- **4 Key Breakthroughs:**
  1. **False Trigger & Quadrant Wrapping:** Standard tan2 angles drop off past 90°; solved via **3D Gravity Vector Dot Product** providing continuous 0°–180° rollover tracking.
  2. **Autonomous Dispatch:** Standard WhatsApp links require user clicks; solved via **Server-Side Meta Cloud API** for 100% hands-free transmission.
  3. **Spatial Precision Without Google Cloud Cost:** Replaced erratic OSM Overpass queries with enterprise **Geoapify API** for lightning-fast hospital resolution.
  4. **Rider Distraction:** Replaced power-draining handlebar OLEDs with an **intuitive 3-button tactile remote** and smartphone HUD.

---

## SLIDE 19: FUTURE ROADMAP & SCALABILITY (Dark)
- **Slide Type:** Dark (#071822)
- **Header:** **Future Scope & Commercial Deployment**
- **Roadmap Milestones:**
  - **Standalone 4G LTE/GPS Module:** Integrated SIM7600 / A7670C module for autonomous emergency calls/SMS even if the rider's phone battery is depleted.
  - **Edge TinyML Crash Classifier:** On-device neural network (TensorFlow Lite for Microcontrollers) trained on potholes, sudden braking, and severe impacts.
  - **Google Play Store Launch:** Pre-built Android package ready for distribution to commercial riders, delivery fleets (Zomato/Swiggy), and commuter bikers.
  - **Direct eCall 112 Integration:** Automated dispatch direct to Government Emergency Response Support System (ERSS 112).

---

## SLIDE 20: CONCLUSION & IMPACT (Dark)
- **Slide Type:** Dark (#071822)
- **Closing Statement:**
  > *We started with one tragic number — twenty deaths every hour on Indian roads.* 
 > *Accidiox cannot prevent every crash, but it guarantees that no rider is ever left alone in the dark.*
- **Call to Action:** **Democratizing life-saving telematics for 250+ Million two-wheeler riders.**
- **Thank You:** KAYA Buildathon 2026 | IIT (BHU) Varanasi
- **Team Contact & Repository Links:** https://github.com/your-repo/accidiox

=============================================================================