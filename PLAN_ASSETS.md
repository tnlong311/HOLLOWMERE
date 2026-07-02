# Asset Plan

- Project: HOLLOWMERE
- Planned at:    2026-06-30T04:02:00Z
- Last verified: 2026-06-30T05:30:00Z (3 BGM, ~27 SFX, 5 UI, 20 GLB on disk; shotgun GLB skipped — unused in slice)
- Skill version: rezona-pgc-game-plan-assets
- Mode: 3d
- Budget: 500 MB (H5 ship-size gate bypassed — explicit human approval, same precedent as DEAD LETTER)
- Art-direction anchor: realistic Gothic-Revival survival-horror, tarnished mid-century materials, muted desaturated palette (the "pixel crush" is a render-time Babylon post-process — render PBR → posterize per-wing palette → Bayer dither → nearest-neighbor upscale — NOT baked into the meshes)
- Audio-direction anchor: cinematic-dark — low strings, slow tempo, sub-bass drone (BGM); low rumble, dark transient, long reverb (SFX)
- Totals: BGM 3, SFX 21 (calls; ~30 files w/ variants), Image 5 (cutouts: 0), Model 21

## Scope

MVP = the bible's vertical slice: **Foyer hub (G01) → Drawing Room save (G03) → East Wing Library (G09) / Study (G10) / Upper Gallery (U06) → Stag crest.** Core systems: tank + modern controls, fixed cinematic cameras, the Sallowed + ripening + burn mechanic, one scripted Steward intrusion, save room + item box + ink.

## BGM (3)

### `bgm_save_room`
**Prompt:** cinematic-dark genre but tender — a warm, fragile music-box / celesta lullaby motif over soft low strings, very slow, intimate, the single moment of relief in a horror score; seamless loop, no fade-out, no percussion.
**Rationale:** plays only inside the Drawing Room (G03) save haven — the genre's safe-room theme; the tonal contrast that makes the rest of the house feel unsafe.

### `bgm_explore_dread`
**Prompt:** cinematic-dark ambient dread bed — sustained low strings, sub-bass drone, distant storm and manor creak, sparse high glassy harmonic stings, almost no melody, oppressive and patient; seamless loop, no fade-out.
**Rationale:** primary exploration loop across the hall and east wing; the platform-managed gameplay BGM (autoplays from game.config.json).

### `bgm_steward_theme`
**Prompt:** cinematic-dark pursuer leitmotif — low brass swells and a slow heavy war-drum pulse rising with dread, dissonant, relentless, oppressive; loops tense, no resolution, no fade-out.
**Rationale:** event-driven swap track that swells when the Steward is near / during his scripted intrusion — the player's true threat radar is the music.

## SFX (21)

### `sfx_pistol_fire` (×3)
**Prompt:** scarce-feeling service pistol gunshot in a stone hall, weighty crack with short reverb tail, slightly different each
**Rationale:** primary firearm; 3 variants prevent the stuttering-same-sound feel.

### `sfx_shotgun_fire` (×1)
**Prompt:** heavy pump-shotgun blast, thunderous, long reverb tail, an event
**Rationale:** the crowd/limb-removal weapon; meant to feel like an "event".

### `sfx_reload` (×1)
**Prompt:** tactile firearm reload, magazine clack and slide, mechanical, dry
**Rationale:** reload foley after firing.

### `sfx_dagger_swipe` (×2)
**Prompt:** quick knife swipe through air then wet flesh impact, short, visceral
**Rationale:** infinite melee + downed-body finisher; 2 variants.

### `sfx_flare_ignite` (×1)
**Prompt:** flare gun ignite and burst into roaring flame, whoosh into sustained fire crackle
**Rationale:** the burn tool — the only way to permanently stop a Sallowed from ripening.

### `sfx_sallowed_groan` (×3)
**Prompt:** low wet undead groan, eyeless shambler, pained and hungry, dark transient
**Rationale:** the Sallowed's idle/aggro tell heard through the pixel murk; 3 variants.

### `sfx_sallowed_ripen` (×1)
**Prompt:** corpse reanimating — wet sinew snap, escalating gurgle rising to a sharp lurch, body-horror
**Rationale:** the signature ripening cue — a body you left rises stronger behind you.

### `sfx_sallowed_lunge` (×1)
**Prompt:** sudden monstrous lunge shriek with lunging footstep, sharp aggressive transient
**Rationale:** the moment a ripened/runner closes distance.

### `sfx_footstep_stone` (×3)
**Prompt:** single footstep on cold stone and encaustic tile, soft, slightly echoing, low-frequency forward
**Rationale:** player locomotion; 3 variants for natural walking.

### `sfx_steward_step` (×1)
**Prompt:** very heavy slow deliberate footstep dragging on stone, ominous, sub-bass thud with reverb
**Rationale:** the Steward's distinct heavy-footstep audio — proximity warning.

### `sfx_door_open` (×1)
**Prompt:** old heavy oak iron-strap door slowly creaking open, long groan of hinges, dread beat
**Rationale:** the genre-signature slow door-transition curtain between rooms.

### `sfx_door_unlock` (×1)
**Prompt:** heavy iron key turning in an old lock, mechanical clunk and latch release
**Rationale:** opening a locked door (Brass Key → Library).

### `sfx_item_pickup` (×1)
**Prompt:** picking up an object, soft cloth and metal handling, brief muted chime
**Rationale:** any inventory pickup.

### `sfx_save_ledger` (×1)
**Prompt:** pen nib scratching on old paper then a heavy ledger book closing, intimate, warm
**Rationale:** saving at the writing desk (ink-ribbon analog).

### `sfx_puzzle_correct` (×1)
**Prompt:** satisfying mechanism locking into place, stone-and-glass clunk with a soft resonant glow chime
**Rationale:** correct shelf order / crest socket seated.

### `sfx_puzzle_invalid` (×1)
**Prompt:** dull dead failure thunk, low and final, no resolution
**Rationale:** wrong puzzle input.

### `sfx_lightning_sting` (×1)
**Prompt:** sharp thunderclap with a hard cold strobe sting and a brief musical reveal stab, scare cue
**Rationale:** scripted reveal scares — lightning strobe through the lancet windows.

### `sfx_grab` (×1)
**Prompt:** enemy grapple grab, wet grasping then a violent struggle break-free, panic
**Rationale:** the Grabbed status — mash/defense-item to break free.

### `sfx_crest_claim` (×1)
**Prompt:** reverent rising stained-glass shimmer and stone resonance, an ominous accomplishment sting
**Rationale:** the stinger when the Stag Crest is taken (triggers a Steward intrusion).

### `sfx_ui_select` (×1)
**Prompt:** muted antique UI select tick, soft mechanical, palette-matched, dry
**Rationale:** inventory / menu navigation.

## Image (5)

### `ui_title` — ui
**Prompt:** realistic Gothic-Revival survival-horror, the single word HOLLOWMERE as a weathered cast-iron / tarnished-silver title logo, gothic blackletter influence, set against fogged stained glass and dark slate, muted desaturated palette, ominous, low-res pixel-bitmap feel, centered, no extra text.
**Cutout:** no
**Rationale:** title / main-menu splash; full-bleed so no cutout.

### `ui_inventory_panel` — ui
**Prompt:** realistic Gothic-Revival survival-horror, an 8-slot courier-satchel inventory grid frame, aged leather and tarnished brass riveted border, empty dark slots, palette-matched UI panel, flat lighting, transparent background, no text.
**Cutout:** no
**Rationale:** the paused inventory screen frame; prompt emits transparency natively so cutout skipped.

### `ui_crest_icons` — ui
**Prompt:** realistic Gothic-Revival survival-horror, four stained-glass house-crest emblems in a 2x2 sheet — a Stag, a Tide wave, a Flame, an Eye — leaded-glass jewel tones on dark stone sockets, icon set, flat lighting, transparent background, no text.
**Cutout:** no
**Rationale:** the four Crest Door socket glyphs; only Stag active in the slice but the full set dresses the hub door.

### `ui_reticle` — ui
**Prompt:** realistic Gothic-Revival survival-horror, a minimal aiming reticle single-glyph icon, thin tarnished-brass crosshair, centered, transparent background, flat lighting, no text, no frame.
**Cutout:** no
**Rationale:** Modern-mode free-aim reticle; native transparency.

### `ui_map_eastwing` — ui
**Prompt:** realistic Gothic-Revival survival-horror, a hand-drawn ink floor-plan map of a manor east wing — Great Hall, Drawing Room, Library, Study, upper Gallery — sepia parchment, annotated, room outlines, fold creases, palette-matched, no modern text.
**Cutout:** no
**Rationale:** the separate map screen, rooms color-coded explored/cleared in code over this base.

## Model (21) — 3D mode

### `env_great_hall` — environment
**Prompt:** realistic Gothic-Revival survival-horror manor great hall / foyer interior, grand sweeping staircase, pointed lancet arches, clustered stone columns, oak wall panelling, encaustic-tile floor, a large iron-strap door alcove with four empty stained-glass crest sockets, tarnished brass sconces, fog, muted desaturated palette, abandoned and decaying.
**Rig:** no
**Animations:** —
**Face limit:** 40000
**Rationale:** the hub room (G01) the player re-crosses all game; houses the Crest Door.

### `env_drawing_room` — environment
**Prompt:** realistic Gothic-Revival survival-horror manor drawing room interior, a lit stone hearth glowing warm, an antique writing desk, a large family oil portrait on the wall, oak panelling, worn rug, the one warm safe haven, muted palette with warm hearth accent.
**Rig:** no
**Animations:** —
**Face limit:** 30000
**Rationale:** the Save Room (G03) — lit hearth + writing desk is the genre's safe-haven signature.

### `env_library` — environment
**Prompt:** realistic Gothic-Revival survival-horror manor double-height library interior, tall dark-oak bookshelves floor to ceiling, a rolling ladder, an upper gallery walkway with iron railing, stained-glass clerestory windows, scattered fallen books, muted dusty palette.
**Rig:** no
**Animations:** —
**Face limit:** 45000
**Rationale:** the East Wing core (G09 lower + U06 upper gallery in one set); the Stag crest puzzle room.

### `env_study` — environment
**Prompt:** realistic Gothic-Revival survival-horror manor study interior, a heavy desk with scattered documents, a wall-safe behind a tilted painting, a tall mirror, bookcases, a dead armchair, oak panelling, muted palette, claustrophobic.
**Rig:** no
**Animations:** —
**Face limit:** 30000
**Rationale:** the Study (G10) — wall-safe puzzle + display-case key.

### `env_east_corridor` — environment
**Prompt:** realistic Gothic-Revival survival-horror manor corridor interior, long stone passage with ribbed vaulting, tall lancet windows with storm beyond, a locked iron-strap door, faded portraits, encaustic-tile runner, fog, muted palette.
**Rig:** no
**Animations:** —
**Face limit:** 30000
**Rationale:** connective hall linking the hub to the East Wing; the Brass-Key door gate.

### `char_courier` — character
**Prompt:** realistic survival-horror player character, a weary relief courier standing in neutral T-pose, heavy waxed-canvas coat, leather satchel across the body, sturdy boots, practical mid-century clothing, muted desaturated tones, grounded realistic proportions.
**Rig:** yes
**Animations:** bundle:locomotion
**Face limit:** —
**Rationale:** the player avatar (over-shoulder in Modern, full in Classic); rigged for idle/walk/run. Tripo. T-pose to keep the rig clean.

### `char_sallowed` — character
**Prompt:** realistic survival-horror undead enemy in neutral T-pose, a hollowed gaunt human corpse, sallow grey-green necrotic skin, sunken eyeless face, tattered period servant clothing, slack jaw, grounded realistic proportions, muted sickly palette.
**Rig:** yes
**Animations:** bundle:locomotion
**Face limit:** —
**Rationale:** the core enemy; rigged shambler (idle/walk + lunge via locomotion). Tripo.

### `char_steward` — character
**Prompt:** realistic survival-horror pursuer enemy in neutral T-pose, a tall hulking changed groundskeeper, heavy apron and gloves stained dark, a sack-cloth hood, broad shoulders, deliberate looming posture, grounded realistic proportions, muted oppressive palette.
**Rig:** yes
**Animations:** bundle:locomotion
**Face limit:** —
**Rationale:** the relentless stalker (Nemesis analog); rigged for his patrol/intrusion. Tripo.

### `prop_crest_door` — prop
**Prompt:** realistic Gothic-Revival survival-horror, a massive iron-strap oak hub door with four recessed stained-glass crest sockets arranged in a row (stag, tide, flame, eye), tarnished brass fittings, ornate, muted palette.
**Rig:** no
**Animations:** —
**Face limit:** 12000
**Rationale:** the Crest Door (G01) — the master-lock the four crests open.

### `prop_stag_crest` — prop
**Prompt:** realistic Gothic-Revival survival-horror, a circular leaded stained-glass crest depicting a heraldic stag, amber and green jewel-glass in a tarnished brass frame, ornate, examinable key item, muted palette.
**Rig:** no
**Animations:** —
**Face limit:** 8000
**Rationale:** the slice's goal pickup; 3D-inspectable key item.

### `prop_display_case` — prop
**Prompt:** realistic Gothic-Revival survival-horror, a tall glass-and-dark-wood display cabinet on ornate legs, brass latches, dusty glass, empty velvet interior, muted palette.
**Rig:** no
**Animations:** —
**Face limit:** 8000
**Rationale:** the gallery case (U06) that opens to reveal the Stag crest.

### `prop_item_box` — prop
**Prompt:** realistic Gothic-Revival survival-horror, a sturdy iron-banded wooden storage trunk with a heavy latch, aged leather straps, sits beside a desk, muted palette.
**Rig:** no
**Animations:** —
**Face limit:** 6000
**Rationale:** the shared save-room storage box (the genre's "magic box").

### `prop_book` — prop
**Prompt:** realistic Gothic-Revival survival-horror, a single aged leather-bound hardcover book, worn gilt spine, slightly battered, muted palette, neutral closed pose.
**Rig:** no
**Animations:** —
**Face limit:** 3000
**Rationale:** instanced ×many for the library reshelve puzzle (low poly, reused).

### `prop_lantern` — prop
**Prompt:** realistic Gothic-Revival survival-horror, an old brass-and-glass hand lantern, candle inside, tarnished, a carry handle, muted palette with warm inner glow.
**Rig:** no
**Animations:** —
**Face limit:** 5000
**Rationale:** dropped lantern / world light source prop.

### `weapon_dagger` — weapon
**Prompt:** realistic survival-horror combat dagger, worn steel blade, wrapped leather grip, slightly tarnished, muted palette, neutral orientation.
**Rig:** no
**Animations:** —
**Face limit:** 3000
**Rationale:** the infinite melee starter weapon.

### `weapon_pistol` — weapon
**Prompt:** realistic survival-horror mid-century service pistol, matte gunmetal, wooden grip, worn, muted palette, neutral orientation.
**Rig:** no
**Animations:** —
**Face limit:** 4000
**Rationale:** the starter firearm.

### `weapon_shotgun` — weapon
**Prompt:** realistic survival-horror pump-action shotgun, dark steel and worn wood stock, muted palette, neutral orientation.
**Rig:** no
**Animations:** —
**Face limit:** 5000
**Rationale:** the crowd/limb-removal weapon.

### `weapon_flare_gun` — weapon
**Prompt:** realistic survival-horror chunky orange-and-black flare gun / lye-thrower, scuffed plastic and metal, muted palette with an orange accent, neutral orientation.
**Rig:** no
**Animations:** —
**Face limit:** 4000
**Rationale:** the burn tool — permanently kills ripening bodies.

### `item_brass_key` — prop
**Prompt:** realistic Gothic-Revival survival-horror, an ornate antique brass door key with a heraldic bow, tarnished, examinable key item, muted palette.
**Rig:** no
**Animations:** —
**Face limit:** 2500
**Rationale:** the Brass Key (from G03) that opens the Library.

### `item_ink_vial` — prop
**Prompt:** realistic Gothic-Revival survival-horror, a small glass ink vial with a dark stopper, aged label, a writing-ink bottle, muted palette.
**Rig:** no
**Animations:** —
**Face limit:** 2500
**Rationale:** the save consumable (ink-ribbon analog).

### `item_fenmoss` — prop
**Prompt:** realistic survival-horror, a clump of pale luminous green healing moss / lichen, organic, slightly glowing, muted sickly-green palette.
**Rig:** no
**Animations:** —
**Face limit:** 2500
**Rationale:** the green healing herb (Fenmoss).

## Already in `src/assets.ts` (0)

None.

## Open questions (0)
