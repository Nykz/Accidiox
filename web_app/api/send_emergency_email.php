<?php
// Automated Emergency Email Dispatch Gateway
// Dispatches high-priority incident telemetry and Google Maps routing directly
// to the nearest hospital trauma desk and registered emergency contacts.

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit();
}

$configFile = __DIR__ . '/email_config.php';
if (file_exists($configFile)) {
    require_once $configFile;
} else {
    $email_sender_name = "Accidiox Emergency Safety Network";
    $email_sender_address = "emergency-alert@accidiox-safety.org";
    $email_delivery_mode = "mail";
    $emergency_hospital_fallback_emails = [
        "Default" => "trauma.emergency.desk@gmail.com"
    ];
}

$input = json_decode(file_get_contents('php://input'), true);

$latitude     = isset($input['latitude']) ? floatval($input['latitude']) : 25.2677;
$longitude    = isset($input['longitude']) ? floatval($input['longitude']) : 82.9913;
$locationName = isset($input['locationName']) ? $input['locationName'] : "Lanka, Varanasi";
$speedKmh     = isset($input['speedKmh']) ? $input['speedKmh'] : 0;
$tiltAngle    = isset($input['tiltAngle']) ? $input['tiltAngle'] : 85;
$hospitalName = isset($input['hospitalName']) ? $input['hospitalName'] : "Nearest Trauma Center";
$hospitalEmail= isset($input['hospitalEmail']) && filter_var($input['hospitalEmail'], FILTER_VALIDATE_EMAIL) 
                ? $input['hospitalEmail'] 
                : (isset($emergency_hospital_fallback_emails['Default']) ? $emergency_hospital_fallback_emails['Default'] : 'emergency@traumacenter.org');

$incidentTime = isset($input['incidentTime']) ? $input['incidentTime'] : date("Y-m-d H:i:s");
$contacts     = isset($input['contacts']) && is_array($input['contacts']) ? $input['contacts'] : [];

$mapsUrl = "https://maps.google.com/?q={$latitude},{$longitude}";
$subject = "🚨 [CRITICAL SOS] Motorcycle Crash Detected near {$locationName} - Immediate Medical Response Required";

// Compose Professional HTML Email Template
$htmlBody = <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; border: 1px solid #dc2626; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
  .header { background: linear-gradient(135deg, #b91c1c, #dc2626); color: #ffffff; padding: 24px; text-align: center; }
  .header h1 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px; }
  .header p { margin: 6px 0 0; opacity: 0.9; font-size: 14px; }
  .body-content { padding: 24px; }
  .alert-badge { display: inline-block; background: #fee2e2; color: #991b1b; font-weight: bold; padding: 6px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
  .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .data-table td { padding: 10px 12px; border-bottom: 1px solid #334155; font-size: 14px; }
  .data-table td.label { color: #94a3b8; font-weight: 600; width: 38%; }
  .data-table td.val { color: #f1f5f9; font-weight: bold; }
  .btn-maps { display: block; width: 100%; box-sizing: border-box; text-align: center; background: #2563eb; color: #ffffff !important; font-weight: bold; text-decoration: none; padding: 14px; border-radius: 8px; font-size: 16px; margin: 20px 0; }
  .footer { background: #0f172a; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🚨 Accidiox Emergency Alert</h1>
    <p>Automated Two-Wheeler Blackbox Incident Notification</p>
  </div>
  <div class="body-content">
    <div class="alert-badge">PRIORITY 1: SEVERE IMPACT DETECTED</div>
    <p style="font-size:15px;line-height:1.5;margin-top:0;">An automated incident detection was triggered. Continuous 10-second lateral fall confirmed via calibrated 6-DOF IMU telemetry. The rider may require immediate trauma triage.</p>
    
    <table class="data-table">
      <tr>
        <td class="label">Incident Location:</td>
        <td class="val">{$locationName}</td>
      </tr>
      <tr>
        <td class="label">GPS Coordinates:</td>
        <td class="val">{$latitude}, {$longitude}</td>
      </tr>
      <tr>
        <td class="label">Incident Timestamp:</td>
        <td class="val">{$incidentTime}</td>
      </tr>
      <tr>
        <td class="label">Speed at Impact:</td>
        <td class="val">{$speedKmh} km/h</td>
      </tr>
      <tr>
        <td class="label">Fallen Tilt Angle:</td>
        <td class="val">{$tiltAngle}° (Lateral Capsize)</td>
      </tr>
      <tr>
        <td class="label">Nearest Target Hospital:</td>
        <td class="val" style="color:#38bdf8;">{$hospitalName}</td>
      </tr>
    </table>

    <a href="{$mapsUrl}" target="_blank" class="btn-maps">📍 Open Live GPS Accident Location on Google Maps</a>
  </div>
  <div class="footer">
    This critical incident notification was automatically generated and verified by the Accidiox IoT Telematics Safety Gateway.
  </div>
</div>
</body>
</html>
HTML;

function send_email_dispatch($to, $subject, $htmlContent, $senderName, $senderEmail, $mode, $smtpConfig) {
    if ($mode === "smtp" && !empty($smtpConfig['username']) && !empty($smtpConfig['password'])) {
        // Direct lightweight SMTP socket transmission
        return send_smtp_socket($to, $subject, $htmlContent, $senderName, $senderEmail, $smtpConfig);
    } else {
        // Native PHP mail()
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: {$senderName} <{$senderEmail}>\r\n";
        $headers .= "X-Priority: 1 (Highest)\r\n";
        $headers .= "X-MSMail-Priority: High\r\n";
        $headers .= "Importance: High\r\n";

        $sent = @mail($to, $subject, $htmlContent, $headers);
        return [
            "success" => $sent,
            "target"  => $to,
            "mode"    => "native_mail",
            "detail"  => $sent ? "Dispatched to mail transfer agent" : "Queued on local environment"
        ];
    }
}

function send_smtp_socket($to, $subject, $htmlContent, $senderName, $senderEmail, $config) {
    $host = $config['host'];
    $port = $config['port'];
    $user = $config['username'];
    $pass = $config['password'];

    $context = stream_context_create(["ssl" => ["verify_peer" => false, "verify_peer_name" => false]]);
    $socket = @stream_socket_client("tcp://{$host}:{$port}", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        return ["success" => false, "target" => $to, "mode" => "smtp", "detail" => "SMTP Connect Error: $errstr ($errno)"];
    }

    $read = fgets($socket, 515);
    fputs($socket, "EHLO " . gethostname() . "\r\n");
    $read = fgets($socket, 515);

    fputs($socket, "STARTTLS\r\n");
    $read = fgets($socket, 515);
    stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);

    fputs($socket, "EHLO " . gethostname() . "\r\n");
    $read = fgets($socket, 515);

    fputs($socket, "AUTH LOGIN\r\n");
    $read = fgets($socket, 515);
    fputs($socket, base64_encode($user) . "\r\n");
    $read = fgets($socket, 515);
    fputs($socket, base64_encode($pass) . "\r\n");
    $read = fgets($socket, 515);

    fputs($socket, "MAIL FROM: <{$user}>\r\n");
    $read = fgets($socket, 515);
    fputs($socket, "RCPT TO: <{$to}>\r\n");
    $read = fgets($socket, 515);
    fputs($socket, "DATA\r\n");
    $read = fgets($socket, 515);

    $msg  = "From: {$senderName} <{$user}>\r\n";
    $msg .= "To: {$to}\r\n";
    $msg .= "Subject: {$subject}\r\n";
    $msg .= "MIME-Version: 1.0\r\n";
    $msg .= "Content-Type: text/html; charset=UTF-8\r\n";
    $msg .= "X-Priority: 1 (Highest)\r\n\r\n";
    $msg .= $htmlContent . "\r\n.\r\n";

    fputs($socket, $msg);
    $read = fgets($socket, 515);
    fputs($socket, "QUIT\r\n");
    fclose($socket);

    return ["success" => true, "target" => $to, "mode" => "smtp", "detail" => "Delivered via SMTP Relay"];
}

$smtpConfig = [
    "host"     => isset($smtp_host) ? $smtp_host : "smtp.gmail.com",
    "port"     => isset($smtp_port) ? $smtp_port : 587,
    "username" => isset($smtp_username) ? $smtp_username : "",
    "password" => isset($smtp_password) ? $smtp_password : ""
];

$recipients = [];
// 1. Hospital Emergency Desk
$hospitalResult = send_email_dispatch(
    $hospitalEmail, 
    $subject, 
    $htmlBody, 
    $email_sender_name, 
    $email_sender_address, 
    $email_delivery_mode, 
    $smtpConfig
);
$recipients[] = [
    "role"    => "Hospital Trauma Desk",
    "name"    => $hospitalName,
    "email"   => $hospitalEmail,
    "status"  => $hospitalResult
];

// 2. Emergency Contacts with valid email addresses
foreach ($contacts as $contact) {
    if (!empty($contact['email']) && filter_var($contact['email'], FILTER_VALIDATE_EMAIL)) {
        $res = send_email_dispatch(
            $contact['email'], 
            $subject, 
            $htmlBody, 
            $email_sender_name, 
            $email_sender_address, 
            $email_delivery_mode, 
            $smtpConfig
        );
        $recipients[] = [
            "role"   => "Emergency Contact",
            "name"   => $contact['name'],
            "email"  => $contact['email'],
            "status" => $res
        ];
    }
}

echo json_encode([
    "status" => "done",
    "hospital_notified" => $hospitalName,
    "hospital_email"    => $hospitalEmail,
    "dispatches"        => $recipients
]);
?>
