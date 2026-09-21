const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE'; // Exact 13.333 x 7.5 inches (16:9 Widescreen)

// --- COLOR PALETTE ---
const NAVY = '071822';
const NAVY_CARD = '0F2432';
const CREAM = 'F4EEE2';
const TAN = 'B9B0A2';
const ORANGE = 'F0A143';

const WHITE = 'FFFFFF';
const LIGHT_BG = 'F8FAFC';
const LIGHT_CARD = 'F1F5F9';
const SLATE_900 = '0F172A';
const SLATE_700 = '334155';
const SLATE_500 = '64748B';
const CARD_BORDER_LIGHT = 'E2E8F0';
const CARD_BORDER_DARK = '1E3A4C';

// --- TYPOGRAPHY (MATCHING TITANIUM BLACK LOGO IDENTITY) ---
const FONT_LOGO = 'Orbitron';     // Futuristic geometric sans matching the lambda 'A' logo
const FONT_HEAD = 'Orbitron';     // Bold modern headers & tech titles
const FONT_TECH = 'Rajdhani';     // Clean technical labels & subheaders
const FONT_BODY = 'Segoe UI';     // Clean, crisp body legibility


// --- ASSET PATHS ---
const ARTIFACT_DIR = 'C:/Users/Lenovo/.gemini/antigravity/brain/afbd78f3-0f8d-4896-a147-7b9301e6e1a5';
const SCREENSHOT_DIR = path.resolve('docs/screenshots');

const IMG_CAD = path.join(ARTIFACT_DIR, 'blackbox_3d_exploded_cad_1789255425744.jpg');
const IMG_SHOWCASE = path.join(ARTIFACT_DIR, 'accidiox_showcase_1789973472107.jpg');
const IMG_KIT = path.join(ARTIFACT_DIR, 'blackbox_complete_hardware_kit_1789255849654.jpg');
const IMG_REMOTE = path.join(ARTIFACT_DIR, 'handlebar_3button_controller_1789255677764.jpg');
const IMG_MOUNT = path.join(ARTIFACT_DIR, 'blackbox_underseat_mounting_1789255396986.jpg');
const IMG_MPU = path.join(ARTIFACT_DIR, 'mpu6050_mounting_orientation_guide_1789417164804.jpg');

// Accident Images
const IMG_ACC_1 = path.resolve('accident images/bike accident images/accident_1.jpg');
const IMG_ACC_2 = path.resolve('accident images/bike accident images/road-accident.webp');
const IMG_ACC_3 = path.resolve('accident images/bike accident images/WhatsApp Image 20171212 at 9.30.39 AM.jpeg');

// Accident Videos
const VID_ACCIDENT = path.resolve('accident videos/vidssave.com Bike Vs Bike Accident _ Caught on CCTV Camera _ Live Accidents in India _ Tirupati Traffic Police 480P.mp4');

// User Mobile Screens & Admin Screens
const SCREEN_HOME_1 = path.resolve('screens/home screen.png');
const SCREEN_HOME_2 = path.resolve('screens/home screen 2.png');
const SCREEN_HOME_3 = path.resolve('screens/home screen 3.png');
const SCREEN_SETTINGS = path.resolve('screens/settings.png');
const SCREEN_ADMIN_1 = path.resolve('screens/admin 1.png');
const SCREEN_ADMIN_2 = path.resolve('screens/admin 2.png');
const SCREEN_ADMIN_IPAD = path.resolve('screens/admin screen ipad.png');
const IMG_CRASH = path.join(SCREENSHOT_DIR, 'preview_crash.png');

// --- IMAGE ASPECT RATIO PARSER ---
function getImageDimensions(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return { width, height, aspect: width / height };
    }
    // JPEG
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let offset = 2;
      while (offset < buf.length) {
        if (buf[offset] !== 0xFF) break;
        const marker = buf[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          return { width, height, aspect: width / height };
        }
        const len = buf.readUInt16BE(offset + 2);
        offset += 2 + len;
      }
    }
    // WEBP
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      if (buf.toString('ascii', 12, 16) === 'VP8 ') {
        const width = buf.readUInt16LE(26) & 0x3fff;
        const height = buf.readUInt16LE(28) & 0x3fff;
        return { width, height, aspect: width / height };
      } else if (buf.toString('ascii', 12, 16) === 'VP8X') {
        const width = 1 + buf.readUIntLE(24, 3);
        const height = 1 + buf.readUIntLE(27, 3);
        return { width, height, aspect: width / height };
      }
    }
  } catch (e) {}
  return { width: 16, height: 9, aspect: 16 / 9 };
}

// Fit an image inside a box preserving aspect ratio without stretching
function getFittedCoords(boxX, boxY, boxW, boxH, imgAspect) {
  const boxAspect = boxW / boxH;
  let targetW, targetH;
  if (imgAspect > boxAspect) {
    targetW = boxW;
    targetH = boxW / imgAspect;
  } else {
    targetH = boxH;
    targetW = boxH * imgAspect;
  }
  const targetX = boxX + (boxW - targetW) / 2;
  const targetY = boxY + (boxH - targetH) / 2;
  return { x: targetX, y: targetY, w: targetW, h: targetH };
}

// --- HELPER FUNCTIONS ---
function addDarkHeader(slide, title, subhead, badge = 'ACCIDIOX • KAYA BUILDATHON 2026') {
  slide.background = { color: NAVY };
  slide.addText(badge.toUpperCase(), {
    x: 0.8, y: 0.4, w: 11.7, h: 0.25,
    fontSize: 9.5, bold: true, color: ORANGE, fontFace: FONT_BODY
  });
  slide.addText(title, {
    x: 0.8, y: 0.65, w: 11.7, h: 0.45,
    fontSize: 22, bold: true, color: CREAM, fontFace: FONT_BODY
  });
  if (subhead) {
    slide.addText(subhead, {
      x: 0.8, y: 1.12, w: 11.7, h: 0.3,
      fontSize: 11.5, color: TAN, fontFace: FONT_BODY
    });
  }
}

function addLightHeader(slide, title, subhead, badge = 'ACCIDIOX • HARDWARE TELEMATICS') {
  slide.background = { color: LIGHT_BG };
  slide.addText(badge.toUpperCase(), {
    x: 0.8, y: 0.4, w: 11.7, h: 0.25,
    fontSize: 9, bold: true, color: ORANGE, fontFace: FONT_TECH, charSpacing: 1.5
  });
  slide.addText(title, {
    x: 0.8, y: 0.65, w: 11.7, h: 0.45,
    fontSize: 20, bold: true, color: SLATE_900, fontFace: FONT_HEAD
  });
  if (subhead) {
    slide.addText(subhead, {
      x: 0.8, y: 1.12, w: 11.7, h: 0.3,
      fontSize: 11, color: SLATE_500, fontFace: FONT_BODY
    });
  }
}

function addCard(slide, opt) {
  const isDark = opt.isDark !== false;
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: opt.x, y: opt.y, w: opt.w, h: opt.h,
    fill: { color: opt.bg || (isDark ? NAVY_CARD : LIGHT_CARD) },
    line: { color: opt.borderColor || (isDark ? CARD_BORDER_DARK : CARD_BORDER_LIGHT), width: opt.borderWidth || 1 },
    rectRadius: opt.rectRadius || 0.08
  });
}

// Add an image inside a container card WITH PERFECT NATIVE ASPECT RATIO (Zero stretching)
function addUnstretchedImageCard(slide, opt) {
  // Draw outer background container card
  addCard(slide, {
    x: opt.x, y: opt.y, w: opt.w, h: opt.h,
    bg: opt.bg, borderColor: opt.borderColor, isDark: opt.isDark,
    rectRadius: opt.rectRadius || 0.08
  });

  if (opt.path && fs.existsSync(opt.path)) {
    const pad = opt.pad !== undefined ? opt.pad : 0.08;
    const availX = opt.x + pad;
    const availY = opt.y + pad;
    const availW = opt.w - pad * 2;
    const availH = opt.h - pad * 2;

    const dims = getImageDimensions(opt.path);
    const fitted = getFittedCoords(availX, availY, availW, availH, dims.aspect);

    slide.addImage({
      path: opt.path,
      x: fitted.x,
      y: fitted.y,
      w: fitted.w,
      h: fitted.h
    });
  }
}

// Add a realistic Phone Mockup Frame WITH PERFECT NATIVE ASPECT RATIO (Zero stretching)
function addUnstretchedPhoneMockup(slide, opt) {
  const dims = opt.path && fs.existsSync(opt.path) ? getImageDimensions(opt.path) : { aspect: 0.46 };
  
  // Calculate phone frame dimensions based on target height or width
  const phoneH = opt.h || 4.7;
  const screenPad = 0.12;
  const screenH = phoneH - screenPad * 2 - 0.15; // Room for top notch & bottom chin
  const screenW = screenH * dims.aspect;
  const phoneW = screenW + screenPad * 2;
  
  // Center horizontally inside the specified container area if boxW provided
  const phoneX = opt.boxW ? opt.x + (opt.boxW - phoneW) / 2 : opt.x;
  const phoneY = opt.y;

  // Phone outer bezel container
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: phoneX, y: phoneY, w: phoneW, h: phoneH,
    fill: { color: '0A141E' },
    line: { color: ORANGE, width: 1.5 },
    rectRadius: 0.14
  });

  // Top pill camera / dynamic island
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: phoneX + (phoneW - 0.6) / 2, y: phoneY + 0.08, w: 0.6, h: 0.1,
    fill: { color: '03080D' }, line: { color: '1A2C38', width: 0.5 }, rectRadius: 0.05
  });

  // Inner Screen Image with exact un-stretched dimensions
  if (opt.path && fs.existsSync(opt.path)) {
    slide.addImage({
      path: opt.path,
      x: phoneX + screenPad,
      y: phoneY + 0.20,
      w: screenW,
      h: screenH
    });
  }
}

// ============================================================================
// SLIDE 1: TITLE / FRONT PAGE (Dark)
// ============================================================================
{
  const slide = pptx.addSlide();
  slide.background = { color: NAVY };

  // Track Badge
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: 0.55, w: 5.6, h: 0.35,
    fill: { color: '143144' }, line: { color: ORANGE, width: 1 }, rectRadius: 0.06
  });
  slide.addText('KAYA BUILDATHON 2026  |  IIT (BHU) VARANASI  |  HARDWARE TRACK', {
    x: 0.9, y: 0.6, w: 5.4, h: 0.25,
    fontSize: 9, bold: true, color: CREAM, fontFace: FONT_BODY
  });

  // Hero Title
  slide.addText('ACCIDIOX', {
    x: 0.8, y: 1.0, w: 5.8, h: 0.85,
    fontSize: 44, bold: true, color: ORANGE, fontFace: FONT_LOGO, charSpacing: 2
  });

  // Subtitle
  slide.addText('AI-Assisted Crash Detection &\nAutomatic Emergency Response for Two-Wheelers', {
    x: 0.8, y: 1.85, w: 5.8, h: 0.75,
    fontSize: 16, bold: true, color: CREAM, fontFace: FONT_BODY, lineSpacing: 20
  });

  // Tagline Card
  addCard(slide, { x: 0.8, y: 2.7, w: 5.8, h: 0.85, bg: NAVY_CARD, borderColor: ORANGE });
  slide.addText('Democratizing Superbike-Grade Safety & Autonomous Life-Saving Telematics for Every Indian Commuter.', {
    x: 1.0, y: 2.78, w: 5.4, h: 0.68,
    fontSize: 11, italic: true, color: CREAM, fontFace: FONT_BODY
  });

  // Bullets summary
  slide.addText([
    { text: '• Autonomous Hardware ECU: ', options: { bold: true, color: ORANGE } },
    { text: '3D Gravity Dot-Product IMU (>85° rollover detection)\n', options: { color: TAN } },
    { text: '• Zero Rider Action: ', options: { bold: true, color: ORANGE } },
    { text: 'Meta WhatsApp Cloud API dispatches GPS & Hospital in 20s\n', options: { color: TAN } },
    { text: '• Built for Bharat: ', options: { bold: true, color: ORANGE } },
    { text: 'Universal ₹1,200 retrofit for 250M+ commuter two-wheelers', options: { color: TAN } }
  ], {
    x: 0.8, y: 3.75, w: 5.8, h: 1.5,
    fontSize: 10, fontFace: FONT_BODY, lineSpacing: 14
  });

  // Visual Right Side (Unstretched 3D CAD)
  addUnstretchedImageCard(slide, {
    x: 6.9, y: 0.65, w: 5.6, h: 5.4,
    path: IMG_SHOWCASE,
    bg: NAVY_CARD, borderColor: ORANGE, isDark: true
  });

  // Footer
  slide.addText('Team Technyks  •  IIT (BHU) Varanasi Hardware Track  •  September 2026', {
    x: 0.8, y: 6.6, w: 11.7, h: 0.25,
    fontSize: 9, color: TAN, fontFace: FONT_BODY
  });
}

// ============================================================================
// SLIDE 2: REAL ACCIDENT IMAGES & GROUND REALITY (Dark)
// ============================================================================
{
  const slide = pptx.addSlide();
  addDarkHeader(slide, 'The Solitary Rider Crisis: Real-World Crash Scenarios', 'Why Indian highway & urban two-wheeler accidents turn fatal without instant response');

  // Left Side: Context & Problem Card
  addCard(slide, { x: 0.8, y: 1.55, w: 5.4, h: 4.8, bg: NAVY_CARD, borderColor: CARD_BORDER_DARK });

  slide.addText('THE UNSEEN HIGHWAY REALITY', {
    x: 1.0, y: 1.75, w: 5.0, h: 0.25,
    fontSize: 10, bold: true, color: ORANGE, fontFace: FONT_BODY
  });

  slide.addText('“When a rider crashes in low-light conditions or quiet highway stretches, they are incapacitated in fractions of a second. Passing vehicles rarely stop, and the Golden Hour expires unnoticed.”', {
    x: 1.0, y: 2.05, w: 5.0, h: 1.05,
    fontSize: 11.5, italic: true, color: CREAM, fontFace: FONT_BODY, lineSpacing: 16
  });

  const points = [
    { title: 'Immediate Loss of Consciousness:', desc: 'Head & thoracic trauma prevents the rider from dialing 112 or reaching their phone.' },
    { title: 'Remote Blind Spots:', desc: 'Bikes often slide off road shoulders into culverts and bushes, remaining hidden for hours.' },
    { title: 'Untraceable Coordinates:', desc: 'Panicked bystanders cannot give accurate GPS coordinates to emergency dispatchers.' }
  ];

  points.forEach((pt, idx) => {
    const y = 3.25 + idx * 0.95;
    slide.addText([
      { text: `• ${pt.title} `, options: { bold: true, color: ORANGE } },
      { text: pt.desc, options: { color: TAN } }
    ], {
      x: 1.0, y: y, w: 5.0, h: 0.85, fontSize: 9.5, fontFace: FONT_BODY, lineSpacing: 13
    });
  });

  // Right Side: 2 Real Accident Photos with Exact Unstretched Aspect Ratios
  addUnstretchedImageCard(slide, {
    x: 6.5, y: 1.55, w: 6.0, h: 2.3,
    path: IMG_ACC_1,
    bg: NAVY_CARD, borderColor: 'DC2626', isDark: true
  });

  addUnstretchedImageCard(slide, {
    x: 6.5, y: 4.05, w: 6.0, h: 2.3,
    path: IMG_ACC_2,
    bg: NAVY_CARD, borderColor: CARD_BORDER_DARK, isDark: true
  });
}

// ============================================================================
// SLIDE 3: ACCIDENT VIDEO ANALYSIS & CRASH KINEMATICS (Dark)
// ============================================================================
{
  const slide = pptx.addSlide();
  addDarkHeader(slide, 'Real-Time Crash Kinematics: Caught on Camera', 'Analyzing severe two-wheeler impacts, instant incapacitation, and mandatory automated alerts');

  // Left Side: Embedded Video / Media Box
  addCard(slide, { x: 0.8, y: 1.55, w: 6.4, h: 4.8, bg: '03080D', borderColor: ORANGE });

  if (fs.existsSync(VID_ACCIDENT)) {
    slide.addMedia({
      type: 'video',
      path: VID_ACCIDENT,
      x: 0.9, y: 1.65, w: 6.2, h: 4.6
    });
  }

  // Right Side: Kinematic Breakdown
  addCard(slide, { x: 7.5, y: 1.55, w: 5.0, h: 4.8, bg: NAVY_CARD, borderColor: CARD_BORDER_DARK });

  slide.addText('CRASH IMPACT DYNAMICS', {
    x: 7.7, y: 1.75, w: 4.6, h: 0.25,
    fontSize: 10, bold: true, color: ORANGE, fontFace: FONT_BODY
  });

  const dynamics = [
    { title: '< 300 Millisecond Impact:', desc: 'High deceleration G-forces violently eject the rider from the handlebar controls.' },
    { title: 'True Physical Rollover (>85°):', desc: 'The motorcycle skids on its side, crossing the 85° vector gravity crash threshold.' },
    { title: 'Why Manual Apps Fail:', desc: 'No conscious human action can occur during or immediately following high-velocity collisions.' },
    { title: 'The Accidiox Mandate:', desc: 'The blackbox hardware detects the rollover instantly, starts the siren, and transmits SOS via cloud.' }
  ];

  dynamics.forEach((d, idx) => {
    const y = 2.1 + idx * 1.0;
    slide.addText([
      { text: `• ${d.title}\n`, options: { bold: true, color: ORANGE, fontSize: 10.5 } },
      { text: d.desc, options: { color: TAN, fontSize: 9 } }
    ], {
      x: 7.7, y: y, w: 4.6, h: 0.9, fontFace: FONT_BODY, lineSpacing: 13
    });
  });
}

// ============================================================================
// SLIDE 4: THE PROBLEM — THE NUMBERS & GRAPHS (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'The Silent Crisis on Indian Roads: Official Data', 'Ministry of Road Transport & Highways (MoRTH) Road Accidents in India 2023');

  const stats = [
    { num: '1,72,890', label: 'Road Fatalities in 2023', sub: 'Total lives lost across Indian roads in 2023, reaching an all-time peak.' },
    { num: '44.8%', label: 'Two-Wheeler Share', sub: 'Highest fatality share of any vehicle category (over 77,000 riders killed).' },
    { num: '20 Deaths', label: 'Every Single Hour', sub: 'A rider loses their life every 3 minutes, predominantly when riding alone.' }
  ];

  stats.forEach((st, i) => {
    const cardX = 0.8 + i * 3.95;
    addCard(slide, { x: cardX, y: 1.55, w: 3.75, h: 2.0, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });
    
    slide.addShape(pptx.shapes.RECTANGLE, {
      x: cardX, y: 1.55, w: 3.75, h: 0.06, fill: { color: ORANGE }, line: { color: ORANGE }
    });

    slide.addText(st.num, {
      x: cardX + 0.2, y: 1.75, w: 3.35, h: 0.55,
      fontSize: 30, bold: true, color: SLATE_900, fontFace: FONT_BODY
    });

    slide.addText(st.label, {
      x: cardX + 0.2, y: 2.35, w: 3.35, h: 0.3,
      fontSize: 12, bold: true, color: ORANGE, fontFace: FONT_BODY
    });

    slide.addText(st.sub, {
      x: cardX + 0.2, y: 2.68, w: 3.35, h: 0.75,
      fontSize: 9.5, color: SLATE_500, fontFace: FONT_BODY, lineSpacing: 13
    });
  });

  // Bottom Category Breakdown Card
  addCard(slide, { x: 0.8, y: 3.75, w: 11.65, h: 2.5, isDark: false, bg: LIGHT_CARD, borderColor: CARD_BORDER_LIGHT });
  
  slide.addText('Fatality Distribution by Vehicle Category in India (MoRTH 2023)', {
    x: 1.1, y: 3.9, w: 11.0, h: 0.3,
    fontSize: 12, bold: true, color: SLATE_900, fontFace: FONT_BODY
  });

  const bars = [
    { label: 'Two-Wheelers (Motorcycles & Scooters)', pct: '44.8%', w: 5.2, color: ORANGE, bold: true },
    { label: 'Cars, Taxis & Light Vans', pct: '14.2%', w: 1.8, color: '64748B' },
    { label: 'Heavy Trucks & Lorries', pct: '10.7%', w: 1.4, color: '94A3B8' },
    { label: 'Buses, Auto-Rickshaws & Others', pct: '30.3%', w: 3.8, color: 'CBD5E1' }
  ];

  bars.forEach((b, idx) => {
    const y = 4.3 + idx * 0.42;
    slide.addText(b.label, {
      x: 1.1, y: y, w: 3.8, h: 0.3,
      fontSize: 9.5, bold: b.bold || false, color: b.bold ? SLATE_900 : SLATE_700, fontFace: FONT_BODY
    });

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 5.0, y: y + 0.05, w: b.w, h: 0.2,
      fill: { color: b.color }, line: { color: b.color }, rectRadius: 0.04
    });

    slide.addText(b.pct, {
      x: 5.1 + b.w, y: y, w: 1.0, h: 0.3,
      fontSize: 10, bold: true, color: b.bold ? ORANGE : SLATE_700, fontFace: FONT_BODY
    });
  });

  slide.addText('Source: Ministry of Road Transport & Highways (MoRTH), "Road Accidents in India 2023". Published Govt of India.', {
    x: 0.8, y: 6.45, w: 11.65, h: 0.25, fontSize: 8.5, italic: true, color: SLATE_500, fontFace: FONT_BODY
  });
}

// ============================================================================
// SLIDE 5: WHY THIS STILL HAPPENS (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'The Existing Safety Gap in the Two-Wheeler Market', 'Why existing smartphone apps, smartwatches, and luxury eCall systems fail everyday commuters');

  const gaps = [
    {
      title: 'Manual SOS Apps',
      tag: 'FAILS WHEN UNCONSCIOUS',
      bullets: [
        'Requires rider to be conscious and reach phone',
        'Phone is often thrown, smashed, or battery dead',
        'Zero integration with vehicle kinematics'
      ],
      color: 'DC2626'
    },
    {
      title: 'Smartwatch Fall Detection',
      tag: 'EXPENSIVE & UNRELIABLE',
      bullets: [
        'High purchase cost (₹25,000 to ₹50,000+)',
        'Frequent false triggers from normal hand gestures',
        'Short battery life (drains within 18–24 hours)'
      ],
      color: 'D97706'
    },
    {
      title: 'Luxury Superbike eCall',
      tag: 'EXCLUSIVE TO LUXURY',
      bullets: [
        'Only on ₹20+ Lakh superbikes (BMW Motorrad, Ducati)',
        'Zero availability for Splendor, Pulsar, or Activa',
        'Proprietary cloud subscription fees'
      ],
      color: '475569'
    }
  ];

  gaps.forEach((g, idx) => {
    const cardX = 0.8 + idx * 3.95;
    addCard(slide, { x: cardX, y: 1.55, w: 3.75, h: 3.0, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: cardX + 0.2, y: 1.7, w: 3.35, h: 0.28,
      fill: { color: g.color }, line: { color: g.color }, rectRadius: 0.04
    });
    slide.addText(g.tag, {
      x: cardX + 0.2, y: 1.74, w: 3.35, h: 0.2,
      fontSize: 8, bold: true, color: WHITE, align: 'center', fontFace: FONT_BODY
    });

    slide.addText(g.title, {
      x: cardX + 0.2, y: 2.1, w: 3.35, h: 0.35,
      fontSize: 13, bold: true, color: SLATE_900, fontFace: FONT_BODY
    });

    slide.addText(g.bullets.map(b => `• ${b}`).join('\n'), {
      x: cardX + 0.2, y: 2.5, w: 3.35, h: 1.9,
      fontSize: 9.5, color: SLATE_700, fontFace: FONT_BODY, lineSpacing: 14
    });
  });

  addCard(slide, { x: 0.8, y: 4.75, w: 11.65, h: 1.6, isDark: false, bg: 'FFFBEB', borderColor: ORANGE, borderWidth: 1.5 });

  slide.addText('ACCIDIOX POSITIONING — THE UNIVERSAL BHARAT SOLUTION', {
    x: 1.0, y: 4.9, w: 11.25, h: 0.25,
    fontSize: 10, bold: true, color: 'B45309', fontFace: FONT_BODY
  });

  slide.addText('A ₹1,200 universal retrofit blackbox that mounts on ANY two-wheeler, detects physical rollovers via 3D vector gravity, and autonomously dispatches emergency WhatsApp alerts with zero driver action required.', {
    x: 1.0, y: 5.2, w: 11.25, h: 0.95,
    fontSize: 11.5, bold: true, color: SLATE_900, fontFace: FONT_BODY, lineSpacing: 15
  });
}

// ============================================================================
// SLIDE 6: OUR SOLUTION (Dark)
// ============================================================================
{
  const slide = pptx.addSlide();
  addDarkHeader(slide, 'Our Solution: A Blackbox for Every Two-Wheeler', 'Autonomous crash detection, false-alarm mitigation, and zero-tap cloud dispatch');

  const pillars = [
    {
      icon: '01',
      title: 'Autonomous Crash Detection',
      desc: 'ESP32 + MPU-6050 3D Gravity Vector Dot Product tracks angular tilt up to 180°. Triggers at >85° true vehicle rollover.'
    },
    {
      icon: '02',
      title: 'Zero False Alarms Window',
      desc: '20-second multi-sensory siren & strobe alert with 1-click handlebar remote cancel button before cloud dispatch triggers.'
    },
    {
      icon: '03',
      title: 'Multi-Channel Cloud Dispatch',
      desc: 'Meta WhatsApp Business Cloud API delivers verified incident alerts, live GPS location, and nearest trauma care hospital.'
    },
    {
      icon: '04',
      title: 'Centralized Fleet Command',
      desc: 'Web-based admin portal with real-time Leaflet.js vehicle tracking, incident logging, and crash telemetry reconstruction.'
    }
  ];

  const cols = 2;
  const startX = 0.8, startY = 1.6, w = 5.65, h = 2.2, gapX = 0.38, gapY = 0.25;

  pillars.forEach((p, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const cardX = startX + c * (w + gapX);
    const cardY = startY + r * (h + gapY);

    addCard(slide, { x: cardX, y: cardY, w, h, bg: NAVY_CARD, borderColor: CARD_BORDER_DARK });

    slide.addShape(pptx.shapes.OVAL, {
      x: cardX + 0.25, y: cardY + 0.25, w: 0.5, h: 0.5,
      fill: { color: ORANGE }, line: { color: ORANGE }
    });
    slide.addText(p.icon, {
      x: cardX + 0.25, y: cardY + 0.32, w: 0.5, h: 0.35,
      fontSize: 11, bold: true, color: NAVY, align: 'center', fontFace: FONT_BODY
    });

    slide.addText(p.title, {
      x: cardX + 0.9, y: cardY + 0.25, w: w - 1.05, h: 0.35,
      fontSize: 13, bold: true, color: CREAM, fontFace: FONT_BODY
    });

    slide.addText(p.desc, {
      x: cardX + 0.9, y: cardY + 0.65, w: w - 1.05, h: 1.35,
      fontSize: 10, color: TAN, fontFace: FONT_BODY, lineSpacing: 14
    });
  });
}

// ============================================================================
// SLIDE 7: SYSTEM ARCHITECTURE (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'End-to-End System Architecture (~20s Pipeline)', 'Autonomous crash-to-dispatch workflow connecting physical sensors to cloud services');

  const archSteps = [
    { num: '1', title: 'Hardware ECU', sub: 'ESP32 + MPU-6050', desc: 'Detects rollover >85°. Fires buzzer, LED & sends BLE GATT packet.' },
    { num: '2', title: 'Rider App', sub: 'PWA / Web BLE', desc: 'Receives CRASH event. Starts 20s siren & countdown timer.' },
    { num: '3', title: 'Spatial Engine', sub: 'GPS + Geoapify', desc: 'Resolves exact street address & finds nearest Trauma Hospital within 5km.' },
    { num: '4', title: 'Cloud Backend', sub: 'PHP + MySQL Server', desc: 'Receives payload, logs incident to database & triggers WhatsApp dispatch.' },
    { num: '5', title: 'Meta Cloud API', sub: 'Official Business API', desc: 'Dispatches verified crash_alert WhatsApp template to emergency contacts.' }
  ];

  archSteps.forEach((s, i) => {
    const cardX = 0.8 + i * 2.38;
    addCard(slide, { x: cardX, y: 1.55, w: 2.2, h: 3.9, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

    slide.addShape(pptx.shapes.OVAL, {
      x: cardX + 0.85, y: 1.75, w: 0.5, h: 0.5,
      fill: { color: ORANGE }, line: { color: ORANGE }
    });
    slide.addText(s.num, {
      x: cardX + 0.85, y: 1.83, w: 0.5, h: 0.35,
      fontSize: 12, bold: true, color: WHITE, align: 'center', fontFace: FONT_BODY
    });

    slide.addText(s.title, {
      x: cardX + 0.1, y: 2.4, w: 2.0, h: 0.3,
      fontSize: 11, bold: true, color: SLATE_900, align: 'center', fontFace: FONT_BODY
    });

    slide.addText(s.sub, {
      x: cardX + 0.1, y: 2.7, w: 2.0, h: 0.25,
      fontSize: 8.5, bold: true, color: ORANGE, align: 'center', fontFace: FONT_BODY
    });

    slide.addText(s.desc, {
      x: cardX + 0.15, y: 3.05, w: 1.9, h: 2.2,
      fontSize: 9, color: SLATE_700, align: 'center', fontFace: FONT_BODY, lineSpacing: 12
    });
  });

  addCard(slide, { x: 0.8, y: 5.65, w: 11.65, h: 0.65, isDark: false, bg: 'FEF3C7', borderColor: ORANGE });
  slide.addText('⚡ TOTAL TIME FROM CRASH IMPACT TO EMERGENCY DISPATCH: APPROXIMATELY 20 SECONDS (100% AUTONOMOUS)', {
    x: 1.0, y: 5.8, w: 11.25, h: 0.35,
    fontSize: 10, bold: true, color: '92400E', align: 'center', fontFace: FONT_BODY
  });
}

// ============================================================================
// SLIDE 8: THE HARDWARE (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'Industrial Retrofit Hardware Assembly', 'Low-cost, highly durable embedded architecture built on ESP32 & FreeRTOS');

  const specs = [
    { title: 'ESP32 Dev Module (WROOM-32):', desc: 'Dual-Core Tensilica LX6 @ 240MHz, FreeRTOS dual-task execution, onboard BLE 4.2 GATT server.' },
    { title: 'MPU-6050 6-Axis Motion Sensor:', desc: 'Direct I2C hardware bus (SDA:21, SCL:22), 3D vector gravity dot-product algorithm with continuous 0°–180° tracking.' },
    { title: 'Audio-Visual Hazard Alert:', desc: 'Dedicated 85dB active piezoelectric buzzer (GPIO 4) + High-intensity hazard strobe LED (GPIO 19).' },
    { title: 'Handlebar 3-Button Controller:', desc: 'Tactile handlebar switches (GPIO 32, 33, 25) with 10k internal pull-ups for media control and 1-click false alarm cancellation.' }
  ];

  specs.forEach((sp, idx) => {
    const y = 1.55 + idx * 1.18;
    addCard(slide, { x: 0.8, y: y, w: 5.8, h: 1.08, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

    slide.addText([
      { text: `${sp.title}\n`, options: { bold: true, color: SLATE_900, fontSize: 10.5 } },
      { text: sp.desc, options: { color: SLATE_700, fontSize: 9 } }
    ], {
      x: 1.0, y: y + 0.1, w: 5.4, h: 0.88, fontFace: FONT_BODY, lineSpacing: 12
    });
  });

  // Unstretched Hardware Kit Image
  addUnstretchedImageCard(slide, {
    x: 6.9, y: 1.55, w: 5.6, h: 4.65,
    path: IMG_KIT,
    bg: WHITE, borderColor: CARD_BORDER_LIGHT, isDark: false
  });
}

// ============================================================================
// SLIDE 9: THE RIDER COCKPIT APP — UNSTRETCHED PHONE (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'Cockpit Dashboard: 3D Digital Twin & HUD', 'Mobile-first PWA with Web Bluetooth telemetry, GPS speed HUD, and spatial awareness');

  const appCards = [
    {
      title: 'Real-Time 3D Digital Twin HUD',
      desc: 'Three.js WebGL canvas rendering a live motorcycle model with dynamic asphalt motion and wheel rotation linked directly to GPS velocity.'
    },
    {
      title: 'Live Telematics & Trip Metrics',
      desc: 'Displays real-time GPS speed, trip duration timer, live coordinate stream, and active Bluetooth LE connection status badge.'
    },
    {
      title: 'Spatial Awareness Widgets',
      desc: 'Instantly identifies the nearest verified Hospital, Police Station, and Fuel Pump with live distance and direct Google Maps navigation.'
    }
  ];

  appCards.forEach((ac, idx) => {
    const y = 1.55 + idx * 1.55;
    addCard(slide, { x: 0.8, y: y, w: 7.2, h: 1.42, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

    slide.addText(ac.title, {
      x: 1.0, y: y + 0.15, w: 6.8, h: 0.3,
      fontSize: 12, bold: true, color: SLATE_900, fontFace: FONT_BODY
    });

    slide.addText(ac.desc, {
      x: 1.0, y: y + 0.5, w: 6.8, h: 0.8,
      fontSize: 9.5, color: SLATE_700, fontFace: FONT_BODY, lineSpacing: 13
    });
  });

  // Unstretched Phone Mockup Frame on Right
  addUnstretchedPhoneMockup(slide, {
    x: 8.5, y: 1.55, boxW: 4.0, h: 4.75,
    path: SCREEN_HOME_1
  });
}

// ============================================================================
// SLIDE 10: RIDER APP FEATURES & LIVE NAVIGATION (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'Rider App Screens: Navigation & Nearest Trauma Care', 'Live facility discovery, emergency routing, and high-accuracy GPS telemetry stream');

  // Left Phone: Home Screen 2 (Unstretched)
  addUnstretchedPhoneMockup(slide, {
    x: 0.8, y: 1.55, boxW: 2.6, h: 4.75,
    path: SCREEN_HOME_2
  });

  // Middle Phone: Home Screen 3 (Unstretched)
  addUnstretchedPhoneMockup(slide, {
    x: 3.7, y: 1.55, boxW: 2.6, h: 4.75,
    path: SCREEN_HOME_3
  });

  // Right Side: Features Card
  addCard(slide, { x: 6.6, y: 1.55, w: 5.9, h: 4.75, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

  slide.addText('INTELLIGENT RIDER HUD & SAFETY NAVIGATION', {
    x: 6.9, y: 1.8, w: 5.3, h: 0.3,
    fontSize: 11, bold: true, color: ORANGE, fontFace: FONT_BODY
  });

  const featList = [
    { title: 'Sub-5m GPS Telematics Capture:', desc: 'HTML5 Geolocation polls high-accuracy coordinates continuous stream into WebGL engine.' },
    { title: 'Speed-Driven Dynamics:', desc: 'Three.js asphalt texture scrolls and wheel spin matches live vehicle speed.' },
    { title: 'Autonomous Facility Routing:', desc: 'Geoapify Places API locates closest Trauma Hospital and Police Station with 1-click Google Maps navigation.' },
    { title: 'Offline-First Resilience:', desc: 'PWA caching ensures telematics HUD operates smoothly even through mobile network dead-zones.' }
  ];

  featList.forEach((f, idx) => {
    const y = 2.25 + idx * 0.98;
    slide.addText([
      { text: `• ${f.title} `, options: { bold: true, color: SLATE_900, fontSize: 10.5 } },
      { text: f.desc, options: { color: SLATE_700, fontSize: 9.5 } }
    ], {
      x: 6.9, y: y, w: 5.3, h: 0.9, fontFace: FONT_BODY, lineSpacing: 13
    });
  });
}

// ============================================================================
// SLIDE 11: SETTINGS & REMOTE DIAGNOSTICS (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'Safety Configuration & Remote Hardware Diagnostics', 'Emergency contact management, BLE telemetry pairing, and live handlebar button feedback');

  const diagCards = [
    {
      title: 'Emergency Contact Manager',
      desc: 'Stores primary and secondary SOS contacts in local persistent storage for zero-delay WhatsApp broadcast.'
    },
    {
      title: 'Handlebar Remote Diagnostics',
      desc: 'Interactive live UI provides visual feedback for Vol+, Play/Pause, and Vol- switches with millisecond response.'
    },
    {
      title: 'Bluetooth Auto-Reconnection',
      desc: 'GATT telemetry client automatically reconnects with exponential backoff if the rider steps away from the vehicle.'
    }
  ];

  diagCards.forEach((dc, idx) => {
    const y = 1.55 + idx * 1.55;
    addCard(slide, { x: 0.8, y: y, w: 6.8, h: 1.42, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

    slide.addText(dc.title, {
      x: 1.0, y: y + 0.15, w: 6.4, h: 0.3,
      fontSize: 12, bold: true, color: SLATE_900, fontFace: FONT_BODY
    });

    slide.addText(dc.desc, {
      x: 1.0, y: y + 0.5, w: 6.4, h: 0.8,
      fontSize: 9.5, color: SLATE_700, fontFace: FONT_BODY, lineSpacing: 13
    });
  });

  // Settings Screen Unstretched (3:4 ratio)
  addUnstretchedPhoneMockup(slide, {
    x: 8.0, y: 1.55, boxW: 4.5, h: 4.75,
    path: SCREEN_SETTINGS
  });
}

// ============================================================================
// SLIDE 12: SPATIAL LOCATION INTELLIGENCE (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'Precision GPS & Geoapify Geospatial Pipeline', 'Three-tier spatial resolution: raw coordinates, human-readable address & nearest trauma hospital');

  const spatials = [
    {
      num: '1',
      title: 'High-Accuracy GPS Stream',
      desc: 'Captures sub-5m latitude/longitude coordinates via HTML5 Geolocation API with high-accuracy GPS hardware polling.'
    },
    {
      num: '2',
      title: 'Reverse Geocoding Engine',
      desc: 'Geoapify Geocoding API converts raw numerical coordinates into clear Street, Landmark, and City names for family peace of mind.'
    },
    {
      num: '3',
      title: 'Autonomous Facility Discovery',
      desc: 'Geoapify Places API queries and ranks the closest Trauma Care Hospital and Police Station within a 5km radius in under 300ms.'
    }
  ];

  spatials.forEach((sp, idx) => {
    const cardX = 0.8 + idx * 3.95;
    addCard(slide, { x: cardX, y: 1.55, w: 3.75, h: 4.65, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

    slide.addShape(pptx.shapes.OVAL, {
      x: cardX + 1.6, y: 1.85, w: 0.55, h: 0.55,
      fill: { color: ORANGE }, line: { color: ORANGE }
    });
    slide.addText(sp.num, {
      x: cardX + 1.6, y: 1.93, w: 0.55, h: 0.35,
      fontSize: 13, bold: true, color: WHITE, align: 'center', fontFace: FONT_BODY
    });

    slide.addText(sp.title, {
      x: cardX + 0.2, y: 2.55, w: 3.35, h: 0.5,
      fontSize: 12, bold: true, color: SLATE_900, align: 'center', fontFace: FONT_BODY
    });

    slide.addText(sp.desc, {
      x: cardX + 0.2, y: 3.15, w: 3.35, h: 2.8,
      fontSize: 10, color: SLATE_700, align: 'center', fontFace: FONT_BODY, lineSpacing: 14
    });
  });
}

// ============================================================================
// SLIDE 13: AUTOMATIC WHATSAPP DISPATCH — ARCHITECTURE (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'Meta WhatsApp Business Cloud API Integration', 'Why server-to-server cloud dispatch is mandatory for autonomous life-saving telematics');

  addCard(slide, { x: 0.8, y: 1.55, w: 5.65, h: 4.65, isDark: false, bg: WHITE, borderColor: 'FCA5A5' });
  
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 1.1, y: 1.75, w: 5.05, h: 0.32, fill: { color: 'FEE2E2' }, line: { color: 'EF4444' }, rectRadius: 0.04
  });
  slide.addText('TRADITIONAL WA.ME CLICK-TO-CHAT (FAILS)', {
    x: 1.1, y: 1.81, w: 5.05, h: 0.22, fontSize: 9, bold: true, color: 'DC2626', align: 'center', fontFace: FONT_BODY
  });

  slide.addText([
    { text: '• Requires Unlocked Smartphone: ', options: { bold: true, color: 'DC2626' } },
    { text: 'User must unlock the device and open WhatsApp.\n\n', options: { color: SLATE_700 } },
    { text: '• Requires Manual Tap: ', options: { bold: true, color: 'DC2626' } },
    { text: 'Pre-fills text box but requires rider to press "Send".\n\n', options: { color: SLATE_700 } },
    { text: '• Critical Failure Mode: ', options: { bold: true, color: 'DC2626' } },
    { text: 'Completely useless when the rider is unconscious, injured, or when phone is thrown during impact.', options: { color: SLATE_700 } }
  ], {
    x: 1.1, y: 2.25, w: 5.05, h: 3.7, fontSize: 10, fontFace: FONT_BODY, lineSpacing: 13
  });

  addCard(slide, { x: 6.8, y: 1.55, w: 5.65, h: 4.65, isDark: false, bg: WHITE, borderColor: '86EFAC' });

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 7.1, y: 1.75, w: 5.05, h: 0.32, fill: { color: 'DCFCE7' }, line: { color: '16A34A' }, rectRadius: 0.04
  });
  slide.addText('ACCIDIOX META CLOUD API (100% AUTONOMOUS)', {
    x: 7.1, y: 1.81, w: 5.05, h: 0.22, fontSize: 9, bold: true, color: '16A34A', align: 'center', fontFace: FONT_BODY
  });

  slide.addText([
    { text: '• Server-to-Server HTTPS: ', options: { bold: true, color: '16A34A' } },
    { text: 'PHP cloud backend talks directly to Meta WhatsApp Graph API.\n\n', options: { color: SLATE_700 } },
    { text: '• Zero Rider Action Required: ', options: { bold: true, color: '16A34A' } },
    { text: 'Message is delivered even if the phone screen is locked or broken.\n\n', options: { color: SLATE_700 } },
    { text: '• Official Business Verification: ', options: { bold: true, color: '16A34A' } },
    { text: 'Verified WhatsApp Business Account ID & dedicated Phone Number ID for guaranteed delivery.', options: { color: SLATE_700 } }
  ], {
    x: 7.1, y: 2.25, w: 5.05, h: 3.7, fontSize: 10, fontFace: FONT_BODY, lineSpacing: 13
  });
}

// ============================================================================
// SLIDE 14: APPROVED WHATSAPP TEMPLATE (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'Meta-Approved crash_alert Template', 'Production-ready compliance for business-initiated emergency broadcasts');

  addCard(slide, { x: 0.8, y: 1.55, w: 5.65, h: 4.65, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

  slide.addText('META PLATFORM COMPLIANCE', {
    x: 1.0, y: 1.75, w: 5.25, h: 0.25,
    fontSize: 10, bold: true, color: ORANGE, fontFace: FONT_BODY
  });

  slide.addText('Meta strictly mandates pre-approved template messages for initiating outbound chats to users outside the 24-hour customer service window.', {
    x: 1.0, y: 2.05, w: 5.25, h: 0.75,
    fontSize: 9.5, color: SLATE_700, fontFace: FONT_BODY, lineSpacing: 13
  });

  const tParams = [
    { p: '{{1}}', name: 'Rider Full Name', eg: 'e.g. John Doe' },
    { p: '{{2}}', name: 'Crash Timestamp', eg: 'e.g. 14:32:05 IST' },
    { p: '{{3}}', name: 'Verified Street Address', eg: 'e.g. MG Road, Near City Mall' },
    { p: '{{4}}', name: 'Live Google Maps URL', eg: 'e.g. https://maps.google.com/?q=...' },
    { p: '{{5}}', name: 'Nearest Hospital Info', eg: 'e.g. Apollo Trauma Care (850m)' }
  ];

  tParams.forEach((tp, idx) => {
    const y = 2.9 + idx * 0.6;
    slide.addText([
      { text: `${tp.p} `, options: { bold: true, color: ORANGE } },
      { text: `${tp.name} `, options: { bold: true, color: SLATE_900 } },
      { text: `(${tp.eg})`, options: { color: SLATE_500, fontSize: 8.5 } }
    ], {
      x: 1.0, y: y, w: 5.25, h: 0.45, fontSize: 9.5, fontFace: FONT_BODY
    });
  });

  addCard(slide, { x: 6.8, y: 1.55, w: 5.65, h: 4.65, isDark: false, bg: LIGHT_CARD, borderColor: CARD_BORDER_LIGHT });

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 7.1, y: 1.75, w: 5.05, h: 0.32, fill: { color: '1E293B' }, line: { color: '1E293B' }, rectRadius: 0.04
  });
  slide.addText('META TEMPLATE: crash_alert [STATUS: APPROVED]', {
    x: 7.1, y: 1.81, w: 5.05, h: 0.22, fontSize: 9, bold: true, color: '38BDF8', align: 'center', fontFace: FONT_BODY
  });

  slide.addText([
    { text: '🚨 CRITICAL ACCIDENT ALERT\n\n', options: { bold: true, color: 'DC2626', fontSize: 10.5 } },
    { text: 'Accidiox detected a severe two-wheeler collision involving ', options: { color: SLATE_900 } },
    { text: '{{1}}', options: { bold: true, color: ORANGE } },
    { text: ' at ', options: { color: SLATE_900 } },
    { text: '{{2}}', options: { bold: true, color: ORANGE } },
    { text: '.\n\n📍 Location: ', options: { bold: true, color: SLATE_900 } },
    { text: '{{3}}\n', options: { color: SLATE_700 } },
    { text: '🗺️ Live Navigation: ', options: { bold: true, color: SLATE_900 } },
    { text: '{{4}}\n\n', options: { color: '2563EB' } },
    { text: '🏥 Nearest Medical Facility: ', options: { bold: true, color: SLATE_900 } },
    { text: '{{5}}\n\n', options: { color: SLATE_700 } },
    { text: 'Please contact the rider or emergency services immediately.', options: { italic: true, color: SLATE_500 } }
  ], {
    x: 7.2, y: 2.25, w: 4.85, h: 3.7, fontSize: 9.5, fontFace: FONT_BODY, lineSpacing: 13
  });
}

// ============================================================================
// SLIDE 15: THE DELIVERED EMERGENCY DISPATCH (Dark)
// ============================================================================
{
  const slide = pptx.addSlide();
  addDarkHeader(slide, 'Zero Taps. Immediate Life-Saving Delivery.', 'Actual emergency WhatsApp payload delivered directly to family and emergency services');

  addCard(slide, { x: 0.8, y: 1.55, w: 5.8, h: 4.65, bg: NAVY_CARD, borderColor: CARD_BORDER_DARK });

  slide.addText('ANATOMY OF THE DELIVERED ALERT', {
    x: 1.0, y: 1.75, w: 5.4, h: 0.25,
    fontSize: 10, bold: true, color: ORANGE, fontFace: FONT_BODY
  });

  const payloadPoints = [
    { title: 'Instant Broadcast:', desc: 'Dispatched within 20 seconds of verified crash detection.' },
    { title: 'Pinpoint Google Maps Link:', desc: 'One tap launches turn-by-turn navigation directly to the rider\'s location.' },
    { title: 'Human-Readable Street Address:', desc: 'Removes ambiguity so family knows the exact area immediately.' },
    { title: 'Nearest Trauma Care Routing:', desc: 'Displays closest hospital name and distance for faster first-responder routing.' },
    { title: 'Zero App Installation Needed for Family:', desc: 'Delivered via native WhatsApp which family members already use daily.' }
  ];

  payloadPoints.forEach((pp, idx) => {
    const y = 2.15 + idx * 0.75;
    slide.addText([
      { text: `• ${pp.title} `, options: { bold: true, color: ORANGE } },
      { text: pp.desc, options: { color: TAN } }
    ], {
      x: 1.0, y: y, w: 5.4, h: 0.68, fontSize: 9.5, fontFace: FONT_BODY, lineSpacing: 12
    });
  });

  // Delivered SOS message unstretched mockup
  addUnstretchedPhoneMockup(slide, {
    x: 7.2, y: 1.55, boxW: 5.3, h: 4.75,
    path: IMG_CRASH
  });
}

// ============================================================================
// SLIDE 16: FLEET COMMAND CENTER — IPAD & WEB VIEW (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'Fleet Command Center: Multi-Vehicle Live Tracking', 'Enterprise dashboard with live Leaflet.js geospatial mapping, speed logs, and incident replay');

  // Left iPad screen mockup (Unstretched 3:4 ratio container)
  addUnstretchedImageCard(slide, {
    x: 0.8, y: 1.55, w: 6.8, h: 4.65,
    path: SCREEN_ADMIN_IPAD,
    bg: '0F172A', borderColor: ORANGE, isDark: true, rectRadius: 0.1
  });

  // Right Side: Fleet Admin Capabilities
  addCard(slide, { x: 7.9, y: 1.55, w: 4.6, h: 4.65, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

  slide.addText('ENTERPRISE FLEET SUITE', {
    x: 8.2, y: 1.75, w: 4.1, h: 0.25,
    fontSize: 10, bold: true, color: ORANGE, fontFace: FONT_BODY
  });

  const adminFeats = [
    { title: 'Live Fleet Telematics:', desc: 'Tracks active delivery and commuter bikes in real-time across cities.' },
    { title: 'Instant Crash Beacons:', desc: 'Visual red hazard rings trigger on the map upon confirmed rollover.' },
    { title: 'Accident Reconstruction:', desc: 'Complete blackbox sensor logs for insurance claims and police investigations.' }
  ];

  adminFeats.forEach((af, idx) => {
    const y = 2.15 + idx * 1.35;
    slide.addText([
      { text: `• ${af.title}\n`, options: { bold: true, color: SLATE_900, fontSize: 11 } },
      { text: af.desc, options: { color: SLATE_700, fontSize: 9.5 } }
    ], {
      x: 8.2, y: y, w: 4.1, h: 1.15, fontFace: FONT_BODY, lineSpacing: 13
    });
  });
}

// ============================================================================
// SLIDE 17: FULL TECH STACK BREAKDOWN (Light)
// ============================================================================
{
  const slide = pptx.addSlide();
  addLightHeader(slide, 'Robust, Production-Ready Technology Stack', 'Integrated embedded firmware, modern web standards, and enterprise cloud APIs');

  const stackCols = [
    {
      title: 'HARDWARE & FIRMWARE',
      color: ORANGE,
      items: [
        { label: 'Microcontroller', val: 'ESP32 Dual-Core (C++ / Arduino IDE)' },
        { label: 'Motion Sensing', val: 'MPU-6050 6-Axis IMU (I2C)' },
        { label: 'Wireless Protocol', val: 'Bluetooth Low Energy (GATT Server)' },
        { label: 'User Interface', val: 'IP65 Handlebar Remote + Strobe/Buzzer' },
        { label: 'Kinematics Math', val: '3D Gravity Dot-Product Algorithm' }
      ]
    },
    {
      title: 'FRONTEND & PWA',
      color: '0284C7',
      items: [
        { label: 'Core Architecture', val: 'HTML5, CSS3 Glassmorphism, JS ES6' },
        { label: '3D WebGL Engine', val: 'Three.js (GLTF Loader, OrbitControls)' },
        { label: 'Geospatial HUD', val: 'Leaflet.js + OpenStreetMap tiles' },
        { label: 'Hardware Telemetry', val: 'Web Bluetooth API (Auto-Reconnect)' },
        { label: 'Mobile Deployment', val: 'PWA + Android Trusted Web Activity' }
      ]
    },
    {
      title: 'CLOUD & BACKEND',
      color: '16A34A',
      items: [
        { label: 'Server Runtime', val: 'PHP 8.x REST API + cURL HTTPS' },
        { label: 'Database', val: 'MySQL Relational Schema (Crash Logs)' },
        { label: 'Emergency API', val: 'Meta WhatsApp Business Cloud API' },
        { label: 'Spatial AI API', val: 'Geoapify Geocoding & Places API' },
        { label: 'Hosting & Security', val: 'HTTPS SSL / Apache Cloud Server' }
      ]
    }
  ];

  stackCols.forEach((sc, idx) => {
    const cardX = 0.8 + idx * 3.95;
    addCard(slide, { x: cardX, y: 1.55, w: 3.75, h: 4.65, isDark: false, bg: WHITE, borderColor: CARD_BORDER_LIGHT });

    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: cardX + 0.2, y: 1.75, w: 3.35, h: 0.32, fill: { color: sc.color }, line: { color: sc.color }, rectRadius: 0.04
    });
    slide.addText(sc.title, {
      x: cardX + 0.2, y: 1.81, w: 3.35, h: 0.22,
      fontSize: 9.5, bold: true, color: WHITE, align: 'center', fontFace: FONT_BODY
    });

    sc.items.forEach((it, iIdx) => {
      const y = 2.25 + iIdx * 0.75;
      slide.addText([
        { text: `${it.label}\n`, options: { bold: true, color: SLATE_900, fontSize: 9.5 } },
        { text: it.val, options: { color: SLATE_700, fontSize: 8.5 } }
      ], {
        x: cardX + 0.25, y: y, w: 3.25, h: 0.65, fontFace: FONT_BODY, lineSpacing: 12
      });
    });
  });
}

// ============================================================================
// SLIDE 18: CHALLENGES SOLVED & INNOVATIONS (Dark)
// ============================================================================
{
  const slide = pptx.addSlide();
  addDarkHeader(slide, 'Engineering Challenges & Breakthrough Solutions', 'Key architectural hurdles overcome during hardware prototyping and software deployment');

  const challenges = [
    {
      title: 'False Triggers & 90° Rollover Drop-Off',
      desc: 'Standard atan2 trigonometric angles wrap around past 90°, causing alert cutoffs at 70°–80° tilt. Solved via 3D Gravity Vector Dot Product providing continuous 0°–180° rollover tracking.'
    },
    {
      title: '100% Autonomous Emergency Dispatch',
      desc: 'Standard wa.me links require manual taps and an unlocked phone. Solved via Server-Side Meta WhatsApp Business Cloud API for hands-free emergency transmission.'
    },
    {
      title: 'Zero-Cost Spatial Precision',
      desc: 'Overpass API/OSM queries suffered from severe timeouts. Solved by integrating Geoapify Geocoding and Places API with sub-300ms nearest hospital resolution.'
    },
    {
      title: 'Rider Distraction & Ergonomics',
      desc: 'Small handlebar OLED screens distract riders. Solved with a tactile 3-button handlebar controller and audio siren, moving rich HUD visuals to the smartphone.'
    }
  ];

  challenges.forEach((ch, idx) => {
    const y = 1.55 + idx * 1.18;
    addCard(slide, { x: 0.8, y: y, w: 5.8, h: 1.08, bg: NAVY_CARD, borderColor: CARD_BORDER_DARK });

    slide.addText([
      { text: `• ${ch.title}\n`, options: { bold: true, color: ORANGE, fontSize: 10 } },
      { text: ch.desc, options: { color: TAN, fontSize: 8.5 } }
    ], {
      x: 1.0, y: y + 0.08, w: 5.4, h: 0.92, fontFace: FONT_BODY, lineSpacing: 12
    });
  });

  // MPU guide unstretched image
  addUnstretchedImageCard(slide, {
    x: 6.9, y: 1.55, w: 5.6, h: 4.65,
    path: IMG_MPU,
    bg: NAVY_CARD, borderColor: CARD_BORDER_DARK, isDark: true
  });
}

// ============================================================================
// SLIDE 19: FUTURE ROADMAP & SCALABILITY (Dark)
// ============================================================================
{
  const slide = pptx.addSlide();
  addDarkHeader(slide, 'Future Scope & Commercial Deployment Roadmap', 'Scaling from prototype to mass manufacturing and national emergency service integration');

  const roadmap = [
    {
      phase: 'PHASE 1 (Q4 2026)',
      title: 'Standalone 4G LTE / GSM Fallback',
      desc: 'Integrating SIM7600 / A7670C module for direct satellite/cellular alerts even if the rider\'s phone battery is depleted or lost.'
    },
    {
      phase: 'PHASE 2 (Q1 2027)',
      title: 'Edge TinyML Crash Classifier',
      desc: 'Deploying lightweight TensorFlow Lite models on ESP32 to distinguish between potholes, high-speed braking, and genuine crashes.'
    },
    {
      phase: 'PHASE 3 (Q2 2027)',
      title: 'Commercial Fleet B2B Launch',
      desc: 'Pre-packaged Android TWA distribution for quick-commerce and delivery fleets (Zomato, Swiggy, Blinkit, Rapido).'
    },
    {
      phase: 'PHASE 4 (Q4 2027)',
      title: 'National ERSS 112 Direct Integration',
      desc: 'Connecting API directly into India\'s Emergency Response Support System (ERSS 112) for automated police and ambulance dispatch.'
    }
  ];

  const cols = 2;
  const startX = 0.8, startY = 1.6, w = 5.65, h = 2.2, gapX = 0.38, gapY = 0.25;

  roadmap.forEach((rm, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const cardX = startX + c * (w + gapX);
    const cardY = startY + r * (h + gapY);

    addCard(slide, { x: cardX, y: cardY, w, h, bg: NAVY_CARD, borderColor: CARD_BORDER_DARK });

    slide.addText(rm.phase, {
      x: cardX + 0.25, y: cardY + 0.2, w: 3.5, h: 0.25,
      fontSize: 9.5, bold: true, color: ORANGE, fontFace: FONT_BODY
    });

    slide.addText(rm.title, {
      x: cardX + 0.25, y: cardY + 0.48, w: w - 0.5, h: 0.35,
      fontSize: 12, bold: true, color: CREAM, fontFace: FONT_BODY
    });

    slide.addText(rm.desc, {
      x: cardX + 0.25, y: cardY + 0.85, w: w - 0.5, h: 1.15,
      fontSize: 9.5, color: TAN, fontFace: FONT_BODY, lineSpacing: 13
    });
  });
}

// ============================================================================
// SLIDE 20: CONCLUSION & IMPACT (Dark)
// ============================================================================
{
  const slide = pptx.addSlide();
  slide.background = { color: NAVY };

  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 3.66, y: 0.6, w: 6.0, h: 0.35,
    fill: { color: '143144' }, line: { color: ORANGE, width: 1 }, rectRadius: 0.06
  });
  slide.addText('KAYA BUILDATHON 2026  |  IIT (BHU) VARANASI', {
    x: 3.66, y: 0.65, w: 6.0, h: 0.25,
    fontSize: 9.5, bold: true, color: CREAM, align: 'center', fontFace: FONT_BODY
  });

  slide.addText('Democratizing Two-Wheeler Safety Across India', {
    x: 0.8, y: 1.15, w: 11.7, h: 0.6,
    fontSize: 26, bold: true, color: CREAM, align: 'center', fontFace: FONT_BODY
  });

  addCard(slide, { x: 1.66, y: 1.9, w: 10.0, h: 1.8, bg: NAVY_CARD, borderColor: ORANGE, borderWidth: 1.5 });
  slide.addText('“We started with one tragic number — twenty deaths every hour on Indian roads.\n\nAccidiox cannot prevent every crash, but it guarantees that no rider is ever left alone in the dark.”', {
    x: 1.9, y: 2.1, w: 9.5, h: 1.4,
    fontSize: 13, italic: true, bold: true, color: CREAM, align: 'center', fontFace: FONT_BODY, lineSpacing: 20
  });

  const badges = [
    { num: '250M+', label: 'Commuter Two-Wheelers in India' },
    { num: '20 Sec', label: 'Average Crash-to-Dispatch Time' },
    { num: '₹1,200', label: 'Universal Retrofit Target Price' }
  ];

  badges.forEach((b, idx) => {
    const cardX = 1.66 + idx * 3.45;
    addCard(slide, { x: cardX, y: 3.95, w: 3.1, h: 1.35, bg: NAVY_CARD, borderColor: CARD_BORDER_DARK });

    slide.addText(b.num, {
      x: cardX, y: 4.1, w: 3.1, h: 0.45,
      fontSize: 22, bold: true, color: ORANGE, align: 'center', fontFace: FONT_BODY
    });

    slide.addText(b.label, {
      x: cardX + 0.1, y: 4.6, w: 2.9, h: 0.45,
      fontSize: 10, bold: true, color: CREAM, align: 'center', fontFace: FONT_BODY
    });
  });

  slide.addText('Thank You  •  Team Technyks  •  Hardware Track  •  IIT (BHU) Varanasi', {
    x: 0.8, y: 5.65, w: 11.7, h: 0.35,
    fontSize: 12, bold: true, color: CREAM, align: 'center', fontFace: FONT_BODY
  });
}

// ============================================================================
// SAVE PRESENTATION
// ============================================================================
const outputFilePrimary = 'ACCIDIOX_KAYA_2026_Pitch_Deck.pptx';
const outputFileV2 = 'ACCIDIOX_KAYA_2026_Pitch_Deck_v2.pptx';
const outputFileV3 = 'ACCIDIOX_KAYA_2026_Pitch_Deck_v4.pptx';

pptx.writeFile({ fileName: outputFileV3 })
  .then(f3 => {
    console.log(`SUCCESS: PowerPoint Presentation generated successfully at "${f3}"!`);
    pptx.writeFile({ fileName: outputFileV2 }).catch(() => {});
    pptx.writeFile({ fileName: outputFilePrimary }).catch(() => {});
  })
  .catch(err => {
    console.error('ERROR generating PowerPoint:', err);
    process.exit(1);
  });

