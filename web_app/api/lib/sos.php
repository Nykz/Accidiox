<?php
// Guard for the paid outbound channels (WhatsApp, voice calls, email).
// These must never become an open relay: only a signed-in rider can trigger
// them, only for a crash they reported in the last 15 minutes, only to the
// contacts saved on their own account, and only a few times per window.

function sos_guard($conn, $channel) {
    require_post();
    $rider = require_role($conn, 'rider');
    $uid = (int) $rider['id'];

    $incident = db_one($conn, "SELECT * FROM incidents WHERE rider_user_id = ? AND created_at > ? ORDER BY id DESC LIMIT 1",
        [$uid, ts_ago(900)]);
    if (!$incident) fail("No recent crash on this account.", 409);
    rate_limit($conn, "sos:$channel:$uid", 3, 900, "This alert was already sent.");

    $contacts = db_all($conn, "SELECT name, phone FROM emergency_contacts WHERE user_id = ? ORDER BY is_primary DESC, id ASC LIMIT 5", [$uid]);
    if (!$contacts) {
        $p = db_one($conn, "SELECT emergency_name, emergency_phone FROM rider_profiles WHERE user_id = ?", [$uid]);
        if ($p && $p['emergency_phone']) $contacts[] = ["name" => $p['emergency_name'], "phone" => $p['emergency_phone']];
    }
    return [$rider, $incident, $contacts];
}

// Client-supplied text only ever appears inside our own message templates.
function sos_text($value, $max = 160) {
    $v = is_scalar($value) ? (string) $value : '';
    $v = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v);
    return mb_substr(trim($v), 0, $max);
}
