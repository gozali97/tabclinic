#!/usr/bin/env bash
# WCAG contrast of the design tokens actually used for text/controls (fg bg label).
S=/home/gozali/.copilot/skills/antislop-human/contrast-check.py
while read -r fg bg label; do
  [ -z "$fg" ] && continue
  printf '%-34s %s on %s: %s\n' "$label" "$fg" "$bg" "$(python3 "$S" "$fg" "$bg" | tr '\n' ' ')"
done <<'EOF'
#7c8798 #ffffff body-on-card
#7c8798 #f9fbfd body-on-page
#9eabc0 #ffffff muted-on-card
#9eabc0 #f9fbfd muted-on-page
#8392a5 #f9fbfd breadcrumb-link
#818181 #ffffff sidebar-link
#6c757d #ffffff secondary-text
#4f5467 #ffffff input-text
#5f76e8 #ffffff primary-link-on-card
#ffffff #5f76e8 white-on-primary
#ffffff #22ca80 white-on-success
#ffffff #ff4f70 white-on-danger
#ffffff #01caf1 white-on-cyan
#ffffff #fb8c00 white-on-orange
#ffffff #6c757d white-on-secondary
#212529 #fdc16a dark-on-warning
#ffffff #1c2d41 white-on-dark
#ff4f70 #ffffff danger-text
#22ca80 #ffffff success-text
#846437 #fff3e1 alert-warning
#126943 #d3f4e6 alert-success
#85293a #ffdce2 alert-danger
#313d79 #dfe4fa alert-info
#e9ecef #ffffff input-border(3:1)
#5f76e8 #ffffff focus-ring(3:1)
EOF
