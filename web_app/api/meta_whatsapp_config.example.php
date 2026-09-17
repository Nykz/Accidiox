<?php
// Copy this file to meta_whatsapp_config.php and fill in real values —
// meta_whatsapp_config.php itself is gitignored (never committed) because
// it holds a live API access token once deployed. Get these from your
// Meta App dashboard (developers.facebook.com) under WhatsApp -> API Setup,
// and from the approved template in WhatsApp Manager -> Message Templates.

$meta_phone_number_id = "your_phone_number_id_here"; // WhatsApp -> API Setup
$meta_access_token    = "your_access_token_here";     // WhatsApp -> API Setup (temporary tokens expire in ~24h — regenerate as needed, or create a permanent System User token later)
$meta_template_name   = "crash_alert";                // Must match the approved template name exactly
$meta_template_lang   = "en_US";
?>
