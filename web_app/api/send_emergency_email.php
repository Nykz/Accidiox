<?php
// Emails the crash details to the emergency desks of the hospitals that
// were alerted for the rider's latest crash. Recipients are looked up on
// the server; the browser can't choose who receives mail.
require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/sos.php';
require_once __DIR__ . '/lib/mailer.php';

[$rider, $incident, $contacts] = sos_guard($conn, 'email');

$hospitals = db_all($conn, "SELECT h.short_name, h.email, a.distance_km FROM incident_alerts a JOIN hospitals h ON h.id = a.hospital_id
                            WHERE a.incident_id = ? AND h.email IS NOT NULL ORDER BY a.alert_rank", [(int) $incident['id']]);

$e = fn($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$lat = (float) $incident['latitude'];
$lon = (float) $incident['longitude'];
$mapsUrl = "https://maps.google.com/?q={$lat},{$lon}";
$place = $incident['location_name'] ?: sprintf('%.5f, %.5f', $lat, $lon);

$rows = [
    "Location" => $place,
    "Coordinates" => sprintf('%.5f, %.5f', $lat, $lon),
    "Reported" => date("d M Y, H:i", strtotime($incident['created_at'])),
    "Rider" => $incident['rider_name'],
    "Blood group" => $incident['blood_group'] ?: "Unknown",
    "Medical notes" => $incident['medical_notes'] ?: "None recorded",
    "Speed at crash" => round((float) $incident['speed_kmh']) . " km/h",
    "Tilt" => round((float) $incident['tilt_angle'], 1) . "°",
];
$table = '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:8px 0 4px">';
foreach ($rows as $k => $v) {
    $table .= '<tr><td style="padding:8px 0;border-bottom:1px solid #edeef1;color:#62666f;width:40%">' . $e($k)
            . '</td><td style="padding:8px 0;border-bottom:1px solid #edeef1;font-weight:600">' . $e($v) . '</td></tr>';
}
$table .= '</table>';
$body = '<p><strong>A two-wheeler crash was confirmed by an Accidiox black box.</strong> The rider did not cancel the alert within 20 seconds.</p>'
      . $table
      . '<p>Accept the case and dispatch an ambulance from your Accidiox hospital console. The first hospital to accept takes the case.</p>';
$html = email_layout("Crash alert: " . $place, $body, "Open location in Google Maps", $mapsUrl);

$results = [];
foreach ($hospitals as $h) {
    $sent = send_mail($h['email'], "Crash alert: " . $place . " · " . ($incident['blood_group'] ?: "blood group unknown"), $html);
    $results[] = ["name" => $h['short_name'], "sent" => $sent['ok']];
}

json_out(["status" => "done", "results" => $results]);
