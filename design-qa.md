# Qualifying cards design QA

final result: passed

Scope: translate the supplied F1 broadcast timing-card reference into three
interactive cards in the existing simulator's lower map space. Preserve the
existing map, controls and application styling. The supplied Fuji screenshot
defines placement; the live browser used the current Madrid qualifying session,
so course geometry, drivers and timing values are intentionally different.

Evidence (workspace outputs, not committed images):
- `../../outputs/qualifying-cards-desktop.png`: three active timing cards.
- `../../outputs/qualifying-cards-finish.png`: actual Q3 finish and two flying laps.
- `../../outputs/qualifying-cards-comparison.png`: reference card crops and
  implementation cards together in one comparison image, reviewed visually.

The reference and implementation share the dark rectangular card, position /
driver header, team-colour rule, tyre compound, large running clock or final
delta, right-aligned reference time and driver, and three sector bars. Three
cards replace the reference's two as requested. Measured split values and a
small confirmed final lap time add readable timing context. No decorative logo
or raster asset is needed for this text/data overlay.

Layout checks at 1440×900 and 1280×720 found three cards entirely inside the
map panel, no horizontal overflow, and no clipped numeric text. Map/elevation
controls remain above the separate card row. Actual running and finished states,
expiry to the next driver, and click-to-focus were exercised. Error logs: empty.

No actionable P0/P1/P2 visual discrepancy was found in the final comparison.
Editorial scope difference: this SIM has three automatic slots and an explicit
three-second hold, rather than reproducing an unverified broadcast direction
algorithm. The exact F1 typeface and team logos are not included; existing app
fonts and team colours are used.
