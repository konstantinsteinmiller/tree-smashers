// Prose content for the generated doc: skill cards + i18n strings.
export const CARDS = {
  phase_step: {
    name: 'Phase Step', drop: '15 · The Phantom Twin', tag: 'DEF',
    color: '#c4b5fd', glyph: 'ghost silhouette with two motion lines',
    fantasy: 'Learned from the Phantom Twin: for a heartbeat the spinner turns to mist and the hit passes straight through.',
    effect: `When an **enemy collision hit** would damage the bearer (step 3 of §5) and the bearer is off cooldown, roll \`chance\`: on success the hit deals **0**, the bearer is **phased for 300 ms** (ignores enemy collision rolls *and* Spiky chip) and the cooldown starts (\`dodgeReadyAt = now + cooldownMs\`).`,
    rules: 'Game-time cooldown. Does not apply to hazards (lava, thunder aura), friendly fire, or skill damage. A phased hit cannot also be mirrored. A dodged hit has no side effects at all: no hit flash, no crit cooldown on the bearer, no life-leech heal for the attacker.',
    counter: 'Cooldown makes multi-hit swarms (split children, 4-enemy squads) chew through it; hazards ignore it; the chance is capped at 10 %.',
    softens: 'Low-defence glass cannons (Star/Piercer tops, Speedy bottoms) against heavy hitters; every build against the one-shot bosses (stat-switch attack phase, life-leech — a dodged hit also denies the leech heal).',
    edges: 'Ghost twins: each twin\'s hit rolls separately (one roll per armed contact). Split children / emitted minions: each contact rolls, cooldown bounds it. Thunder boss: aura damage is a hazard (not dodgeable). Two-way contact (both moving): only the incoming half can be dodged; the bearer\'s own hit still lands. Simultaneous procs: Phase is resolved before Mirror; if it fires, Mirror does not roll.'
  },
  guard_shell: {
    name: 'Guard Shell', drop: '20 · The Iron Brotherhood', tag: 'DEF',
    color: '#67e8f9', glyph: 'heater shield',
    fantasy: 'An iron carapace forged from the Brotherhood\'s plating — the first hits of every fight bounce off it.',
    effect: 'At battle start (`initGame`) the bearer gets `shield = round(maxHp × shield)` (min 1). **Every** HP loss of any kind (collision, chip, lava, thunder aura, friendly fire, reflect) is taken from the shield first, the remainder from HP. The shield never regenerates.',
    rules: 'Absorbed amounts pop as cyan numbers. The anti-draw rule in `resolveCollision` must use `hp + shield` as the survivability check. Second Wind watches HP only (it can fire after the shield is gone).',
    counter: 'Spent on the first 1–2 hits; long fights (healers, stage 50/100) dilute it; no regeneration.',
    softens: 'Low-HP builds (Star and Piercer tops, Speedy bottom: +0 HP bonus) and first-strike losses (the enemy starts 70 % of the time after a win).',
    edges: 'Bosses: absorbs the stat-switch one-shot partially at L10 (16 % of max HP). Lava: absorbs lava burns (they are small, so the shield lasts). Forest heal restores HP, never the shield. Split/emitted minions chip it down like anything else.'
  },
  second_wind: {
    name: 'Second Wind', drop: '25 · The Mending Choir', tag: 'SUS',
    color: '#4ade80', glyph: 'heart with an up-arrow (heart from the shared icon set)',
    fantasy: 'The Choir\'s hymn: when the spinner wobbles, it catches its breath and spins back up.',
    effect: 'Once per battle per bearer: after any HP loss that leaves `0 < hp ≤ threshold × maxHp` (35 %), heal `heal × maxHp` immediately (capped at max HP).',
    rules: 'Checked inside `applyHpLoss` after every kind of damage. Never on the killing blow (overkill = no heal). Resets per battle.',
    counter: 'Big one-shots skip the window; it fires once; a player who is already healthy gets nothing from it.',
    softens: 'Everyone, most of all tanky builds (Round/Soft Shell tops, Tanky bottom) that survive long enough to reach the threshold; turns near-losses into comebacks.',
    edges: 'Forest arena heals add on top. Guard Shell absorbs first. Stat-switch and ghost one-shots often skip it (by design — the other defensive skills cover those). Each spinner has its own once-per-battle trigger.'
  },
  lucky_edge: {
    name: 'Lucky Edge', drop: '30 · Chaos Incarnate', tag: 'OFF',
    color: '#fbbf24', glyph: 'four-leaf clover',
    fantasy: 'Chaos favours the bold: now and then a glancing blow lands like a sledgehammer.',
    effect: 'On every armed collision where the bearer deals damage > 0 to an enemy **and the hit is not already a crit** (positional back-hit or the Star\'s hidden 8 % crit), roll `chance`: on success multiply that hit by `mult`.',
    rules: 'Does not set `lastCritAt` (never blocks the game\'s own crits). Never on chip, rockets, reflect, salvo. Combined with Momentum it is clamped by `SKILL_HIT_MUL_CAP = 2.2`. Rendered like a crit number (orange, 1.5× size) but **without** `shadowBlur`.',
    counter: 'Pure variance; worth nothing against a resting target you cannot reach.',
    softens: 'Low-damage tanks (Round Guard, Soft Shell, Quad Core) that rarely land decisive hits; also shortens long boss fights.',
    edges: 'Ghost link: the boosted amount is mirrored to the twin (as with any hit). Thunder combo: multiplies as usual (the clamp covers only skill multipliers). Healers/partners: no interaction.'
  },
  homing_rockets: {
    name: 'Homing Rockets', drop: '35 · The Ravenous Swarm', tag: 'OFF',
    color: '#fb923c', glyph: 'small diagonal rocket',
    fantasy: 'Scavenged from the Swarm: every few clashes the spinner vents a volley of micro-rockets at whoever is weakest.',
    effect: 'Each **armed contact** between the bearer and an enemy (hit dealt *or* taken) adds 1 to a counter. At `everyN` the counter resets and a volley fires at up to 3 living, non-invulnerable enemies, **lowest current HP first**, ghost-linked twins counting as one target. The volley deals `frac × refHit(bearer, target)` in total, **split evenly** across its targets (min 1 each); each rocket lands **400 ms** later (game time).',
    rules: '`refHit` = the collision formula at 50 % of the bearer\'s max speed, with the speed factor capped at 1.5 (`0.5 × 14 × min(speedMultiplier, 1.5)` — without the cap Speedy builds, whose multiplier reaches 2.5+ by stage 30, inflated rockets past the pair cap), no crit/combo/speed-advantage, with the bearer\'s Piercer/Star defence rule and the target\'s weight and defence (split-child modifiers apply). Rockets can kill (split-on-death runs). A rocket whose target died fizzles. Rocket damage never triggers skills.',
    counter: 'Damage respects the target\'s defence (weak vs Soft Shell tanks), is split across targets, and needs contacts — a spinner that is never touched fires nothing.',
    softens: 'Multi-enemy stages, healer squads, split and child-emitter swarms (finishes low-HP minions); tanky players who get hit a lot (hits taken also charge it).',
    edges: 'Ghost boss: twins deduped (otherwise the damage link would double it). Split children: invulnerable ones are skipped. Child-emitter: minions count as contacts and as targets. Pool of 6 visual rockets; if full, damage still applies (no visual).'
  },
  opening_salvo: {
    name: 'Opening Salvo', drop: '40 · The Dragon Specter', tag: 'OFF',
    color: '#f87171', glyph: 'three falling meteors',
    fantasy: 'The Dragon\'s breath rides the meteor shower in: the fight starts with the enemy already scorched.',
    effect: 'At the moment the meteor intro ends (`updatePhysics`, `meteor_intro → deciding_turn`), every living enemy loses `pct × maxHp` (min 1), **non-lethal** (`min(amount, hp − 1)`). Fires once per battle per team.',
    rules: 'Applied before the ghost twin exists (the twin inherits the reduced HP) and after the boss rubber band (percent of the reduced max HP). Kind `salvo` (no skill recursion).',
    counter: 'Healers heal it back by contact (2 HP / 250 ms); non-lethal; one-time.',
    softens: 'Bosses and high-HP tank rosters (percent damage ignores defence) — exactly the stages where players get stuck.',
    edges: 'Daily lone enemy with boss stats: percent of the doubled HP. Split boss: hits the parent only (children don\'t exist yet). PvP: off. Visual: explosion spritesheet at 0.5 scale per enemy (≤ 5), one `explosion-1` sound.'
  },
  momentum: {
    name: 'Momentum', drop: '45 · The Unbroken Trio', tag: 'OFF',
    color: '#38bdf8', glyph: 'double chevron »',
    fantasy: 'An unbroken chain: every rebound winds the spinner tighter.',
    effect: 'Only during the bearer\'s **own launch** (`launchedBladeId === bearer.id`): every wall rebound, every bouncer rebound and every hit on an enemy adds a stack (max 3). Each collision hit on an enemy is multiplied by `1 + perStack × stacks` (stacks counted **before** that hit adds its own). Stacks reset in `beginLaunch`.',
    rules: 'Clamped together with Lucky Edge by `SKILL_HIT_MUL_CAP`. No effect on chip/rockets/reflect.',
    counter: 'Needs deliberate bank shots; a straight shot into the first enemy gets nothing; Teleporter skin (wall pass) never rebounds.',
    softens: 'Speedy bottoms, ice arena and bouncer stages, skilled players who aim off walls — the skill-expression pick of the ten. The simulated player never aims off walls on purpose, so its measured median (~1.04) is a floor; 1.225 (every hit at 3 stacks) is the ceiling.',
    edges: 'Shock walls still count the rebound (speed drained, stack kept). Thunder arena: stacks multiply with the existing same-target combo. Worst case every hit at 3 stacks = ×1.225 at L10 (§3.8).'
  },
  hazard_ward: {
    name: 'Hazard Ward', drop: '50 · The Eternal Grove', tag: 'UTL',
    color: '#a3e635', glyph: 'hexagon ward with a flame notch',
    fantasy: 'The Grove\'s bark-weave: fire, lightning and thorns slide off.',
    effect: 'Against the bearer: lava wall burn ×(1 − `lava`), thunder-boss aura ×(1 − `thunder`), Spiky chip ×(1 − `chip`); on a shock wall/bouncer the bearer keeps `10 % + 90 % × shockKeep` of its speed instead of 10 %.',
    rules: 'Applied first in `applyHpLoss` for kinds `lava`, `thunder`, `chip`; shock handled in `bounceOffWalls`/`bounceOffBouncers`. The lava popup shows the reduced amount (cyan tint).',
    counter: 'Does nothing on default/ice/forest arenas without Spiky or thunder enemies — a loadout choice per stage, not a permanent pick.',
    softens: 'the 17 lava stages (12, 17, 27, 32, 36, 42, 47, 52, 57, 62, 67, 72, 77, 82, 86, 92, 97), the 10 shock stages and the 46 of 100 stages with a Spiky enemy; players who ricochet a lot.',
    edges: 'Stage 95 (thunder boss + partners): the aura is the main hazard. Lava lethal touch: reduced burn may no longer be lethal (fine). Forest: no effect.'
  },
  static_charge: {
    name: 'Static Charge', drop: '55 · The Dread Scorpion', tag: 'CTL',
    color: '#facc15', glyph: 'lightning bolt',
    fantasy: 'The Scorpion\'s sting, bottled: whoever rams the spinner gets zapped stiff.',
    effect: 'On an armed contact between the bearer and an enemy blade **that is taking its own turn** (`launchedBladeId === enemy.id`) and still moving after the bounce, roll `chance` (shared 250 ms shock cooldown `lastShockMs`): the enemy loses 90 % of its speed (as on a shock wall) and is **Stunned** — it cannot be picked in the enemy team\'s next turn. If every living enemy is stunned, that enemy turn is skipped. A blade stunned for turn T cannot be stunned for T + 1.',
    rules: '`launchNpc` increments `npcTurnIndex` and filters `stunnedForTurn === npcTurnIndex`. Skipped turn = the normal `npc_launched → player_turn` bookkeeping (stat-switch back to defence). The stun is shown as a bolt glyph over the enemy until its turn passes.',
    counter: 'Only procs on enemies that ram the bearer; squads simply launch another member; never two stuns in a row on the same blade.',
    softens: 'A boss specialist: lone bosses (a stun is a skipped boss turn — stages 30/35/80 measure 1.11–1.16) and heavy rammers. Near-neutral against squads, where another member simply launches instead (median 1.02) — a loadout pick for boss stages, like Hazard Ward is for hazard arenas.',
    edges: 'Ghost twins are separate blades (one stunned, the other acts). Split children: each separately. Teleporter enemies: normal. Proc on the first contact of a launch usually ends that launch (speed drained) — intended.'
  },
  mirror_plate: {
    name: 'Mirror Plate', drop: '10 · The Bear Mother', tag: 'DEF',
    color: '#e2e8f0', glyph: 'hex plate with a return arrow',
    fantasy: 'The Bear Mother\'s hide: half the blow comes back where it came from.',
    effect: 'When an enemy collision hit lands on the bearer (not phased), roll `chance`: the bearer takes `dmg × 0.5`, and the attacker takes `dmg × 0.5 / max(1, attacker.defenseMultiplier)` as damage from the bearer (kind `reflect`).',
    rules: 'Reflect can kill (split-on-death runs), is mirrored by ghost links, never triggers skills, never crits. Life-leech heals only from the halved hit it actually dealt.',
    counter: 'Reflected damage is divided by the attacker\'s defence — weak against tanks, strong against glass cannons; no effect on hazards.',
    softens: 'Tanks that get rammed a lot (Round Guard, Soft Shell, Tanky bottom): turns being hit into damage.',
    edges: 'Stat-switch boss: its huge attack-phase hit is halved; the reflect is divided by its defence (5.4 at stage 80), so it cannot be farmed. Multiple procs per battle are allowed (no cooldown).'
  }
}

// Level-table columns shown per skill: [paramKey, header, formatter]
const pc = (v) => `${+(v * 100).toFixed(1)}%`
export const TABLE_COLS = {
  guard_shell: [['shield', 'shield (% max HP)', pc]],
  phase_step: [['chance', 'dodge chance', pc], ['cooldownMs', 'cooldown', (v) => `${(v / 1000).toFixed(1)} s`]],
  mirror_plate: [['chance', 'proc chance', pc], ['share', 'blocked / reflected share', pc]],
  second_wind: [['heal', 'heal (% max HP)', pc], ['threshold', 'trigger at HP ≤', pc]],
  lucky_edge: [['chance', 'chance', pc], ['mult', 'damage ×', (v) => `×${v.toFixed(2)}`], [(p) => 1 + p.chance * (p.mult - 1), 'EV on hits', (v) => `×${v.toFixed(3)}`]],
  momentum: [['perStack', 'per stack', pc], [(p) => 1 + 3 * p.perStack, 'at 3 stacks', (v) => `×${v.toFixed(3)}`]],
  homing_rockets: [['everyN', 'contacts per volley', (v) => `${v}`], ['frac', 'volley (× ref hit)', pc]],
  opening_salvo: [['pct', 'enemy max HP lost', pc]],
  static_charge: [['chance', 'stun chance', pc]],
  hazard_ward: [['lava', 'lava/thunder −', pc], ['chip', 'Spiky chip −', pc], [(p) => 0.1 + 0.9 * p.shockKeep, 'speed kept on shock (base 10%)', pc]]
}

export const LOCALES = ['en', 'de', 'es', 'fr', 'jp', 'kr', 'ru', 'zh']
export const I18N = {
  en: {
    ui: {
      title: 'Skills', slotEmpty: 'Empty', slotAria: 'Skill slot {n}', unlockAt: 'Stage {n}',
      teaser: 'Beat the Stage {n} boss to unlock skills!', lockedSkill: 'Unlocks after the Stage {n} boss',
      equip: 'Equip', remove: 'Remove', equipped: 'Equipped', max: 'MAX', new: 'NEW', now: 'Now', next: 'Next',
      unlockedTitle: 'Skills unlocked!', newSkillTitle: 'New skill!', newSlotTitle: 'New skill slot!',
      bossDrop: 'Beat this boss to unlock {name}', learn: 'Learn', opponentSkills: 'Opponent\'s skills',
      hint: 'Your equipped skills work on both spinners. Learn and upgrade skills with coins up to level 10.',
      upgradeAria: 'Upgrade {name} for {cost} coins', hudAria: '{name}, level {n}'
    },
    names: {
      phase_step: 'Phase Step',
      guard_shell: 'Guard Shell',
      second_wind: 'Second Wind',
      lucky_edge: 'Lucky Edge',
      homing_rockets: 'Homing Rockets',
      opening_salvo: 'Opening Salvo',
      momentum: 'Momentum',
      hazard_ward: 'Hazard Ward',
      static_charge: 'Static Charge',
      mirror_plate: 'Mirror Plate'
    },
    desc: {
      phase_step: '{chance}% chance to phase through an enemy hit and take no damage. Cooldown {cd}s.',
      guard_shell: 'Start every battle with a shield worth {pct}% of max HP. It absorbs damage before HP.',
      second_wind: 'Once per battle, when HP drops to {threshold}% or less: heal {pct}% of max HP.',
      lucky_edge: '{chance}% chance for a hit to become a lucky crit dealing ×{mult} damage.',
      homing_rockets: 'Every {n} clashes with enemies: rockets hit up to 3 enemies for {pct}% of a solid hit, shared.',
      opening_salvo: 'When the battle starts, every enemy loses {pct}% of its max HP.',
      momentum: 'During your launch, each wall bounce or hit adds +{pct}% damage to your next hits (max 3).',
      hazard_ward: 'Lava and thunder auras hurt {hazard}% less, spikes {chip}% less; shock walls leave you {shock}% speed instead of 10%.',
      static_charge: '{chance}% chance to zap an enemy that rams you: it stops and skips its next turn.',
      mirror_plate: '{chance}% chance to block half of an enemy hit and send it back.'
    }
  },
  de: {
    ui: {
      title: 'Fähigkeiten',
      slotEmpty: 'Leer',
      slotAria: 'Fähigkeitsplatz {n}',
      unlockAt: 'Etappe {n}',
      teaser: 'Besiege den Boss von Etappe {n}, um Fähigkeiten freizuschalten!',
      lockedSkill: 'Wird nach dem Boss von Etappe {n} freigeschaltet',
      equip: 'Ausrüsten',
      remove: 'Entfernen',
      equipped: 'Ausgerüstet',
      max: 'MAX',
      new: 'NEU',
      now: 'Jetzt',
      next: 'Nächste',
      unlockedTitle: 'Fähigkeiten freigeschaltet!',
      newSkillTitle: 'Neue Fähigkeit!',
      newSlotTitle: 'Neuer Fähigkeitsplatz!',
      bossDrop: 'Besiege diesen Boss, um {name} freizuschalten',
      learn: 'Erlernen',
      opponentSkills: 'Fähigkeiten des Gegners',
      hint: 'Ausgerüstete Fähigkeiten wirken auf beide Spinner. Erlerne und verbessere sie mit Münzen bis Stufe 10.',
      upgradeAria: '{name} für {cost} Münzen verbessern',
      hudAria: '{name}, Stufe {n}'
    },
    names: {
      phase_step: 'Phasenschritt',
      guard_shell: 'Schutzschale',
      second_wind: 'Zweiter Atem',
      lucky_edge: 'Glücksklinge',
      homing_rockets: 'Lenkraketen',
      opening_salvo: 'Eröffnungssalve',
      momentum: 'Schwung',
      hazard_ward: 'Gefahrenschutz',
      static_charge: 'Statische Ladung',
      mirror_plate: 'Spiegelplatte'
    },
    desc: {
      phase_step: '{chance}% Chance, durch einen gegnerischen Treffer hindurchzugleiten – kein Schaden. Abklingzeit {cd} s.',
      guard_shell: 'Beginnt jeden Kampf mit einem Schild von {pct}% der max. HP. Er fängt Schaden vor den HP ab.',
      second_wind: 'Einmal pro Kampf, wenn die HP auf {threshold}% oder weniger fallen: heilt {pct}% der max. HP.',
      lucky_edge: '{chance}% Chance, dass ein Treffer zum Glückstreffer mit ×{mult} Schaden wird.',
      homing_rockets: 'Alle {n} Zusammenstöße mit Gegnern: Raketen treffen bis zu 3 Gegner mit zusammen {pct}% eines kräftigen Treffers.',
      opening_salvo: 'Zu Kampfbeginn verliert jeder Gegner {pct}% seiner max. HP.',
      momentum: 'Während deines Starts gibt jeder Wandabpraller oder Treffer +{pct}% Schaden für die nächsten Treffer (max. 3×).',
      hazard_ward: 'Lava und Donner-Auren schaden {hazard}% weniger, Stacheln {chip}% weniger; Schockwände lassen dir {shock}% Tempo statt 10%.',
      static_charge: '{chance}% Chance, einen Gegner zu schocken, der dich rammt: Er stoppt und setzt seinen nächsten Zug aus.',
      mirror_plate: '{chance}% Chance, die Hälfte eines gegnerischen Treffers abzublocken und zurückzuschicken.'
    }
  },
  es: {
    ui: {
      title: 'Habilidades',
      slotEmpty: 'Vacío',
      slotAria: 'Espacio de habilidad {n}',
      unlockAt: 'Etapa {n}',
      teaser: '¡Vence al jefe de la etapa {n} para desbloquear habilidades!',
      lockedSkill: 'Se desbloquea tras el jefe de la etapa {n}',
      equip: 'Equipar',
      remove: 'Quitar',
      equipped: 'Equipada',
      max: 'MÁX',
      new: 'NUEVO',
      now: 'Ahora',
      next: 'Siguiente',
      unlockedTitle: '¡Habilidades desbloqueadas!',
      newSkillTitle: '¡Nueva habilidad!',
      newSlotTitle: '¡Nuevo espacio de habilidad!',
      bossDrop: 'Vence a este jefe para desbloquear {name}',
      learn: 'Aprender',
      opponentSkills: 'Habilidades del rival',
      hint: 'Las habilidades equipadas funcionan en ambas peonzas. Apréndelas y mejóralas con monedas hasta el nivel 10.',
      upgradeAria: 'Mejorar {name} por {cost} monedas',
      hudAria: '{name}, nivel {n}'
    },
    names: {
      phase_step: 'Paso fantasma',
      guard_shell: 'Escudo guardián',
      second_wind: 'Segundo aliento',
      lucky_edge: 'Filo afortunado',
      homing_rockets: 'Cohetes teledirigidos',
      opening_salvo: 'Salva inicial',
      momentum: 'Impulso',
      hazard_ward: 'Guarda de peligros',
      static_charge: 'Carga estática',
      mirror_plate: 'Placa espejo'
    },
    desc: {
      phase_step: '{chance}% de probabilidad de atravesar un golpe enemigo sin recibir daño. Recarga {cd} s.',
      guard_shell: 'Empieza cada combate con un escudo del {pct}% de la vida máxima. Absorbe daño antes que la vida.',
      second_wind: 'Una vez por combate, cuando la vida baja al {threshold}% o menos: cura el {pct}% de la vida máxima.',
      lucky_edge: '{chance}% de probabilidad de que un golpe sea un crítico afortunado de ×{mult} daño.',
      homing_rockets: 'Cada {n} choques con enemigos: cohetes golpean hasta 3 enemigos con el {pct}% de un golpe fuerte, repartido.',
      opening_salvo: 'Al empezar el combate, cada enemigo pierde el {pct}% de su vida máxima.',
      momentum: 'Durante tu lanzamiento, cada rebote en la pared o golpe añade +{pct}% de daño a tus siguientes golpes (máx. 3).',
      hazard_ward: 'La lava y las auras de trueno dañan un {hazard}% menos, los pinchos un {chip}% menos; las paredes eléctricas te dejan un {shock}% de velocidad en vez del 10%.',
      static_charge: '{chance}% de probabilidad de electrocutar a un enemigo que te embiste: se detiene y pierde su siguiente turno.',
      mirror_plate: '{chance}% de probabilidad de bloquear la mitad de un golpe enemigo y devolverla.'
    }
  },
  fr: {
    ui: {
      title: 'Compétences',
      slotEmpty: 'Vide',
      slotAria: 'Emplacement de compétence {n}',
      unlockAt: 'Étape {n}',
      teaser: 'Bats le boss de l’étape {n} pour débloquer les compétences !',
      lockedSkill: 'Débloquée après le boss de l’étape {n}',
      equip: 'Équiper',
      remove: 'Retirer',
      equipped: 'Équipée',
      max: 'MAX',
      new: 'NOUVEAU',
      now: 'Actuel',
      next: 'Suivant',
      unlockedTitle: 'Compétences débloquées !',
      newSkillTitle: 'Nouvelle compétence !',
      newSlotTitle: 'Nouvel emplacement de compétence !',
      bossDrop: 'Bats ce boss pour débloquer {name}',
      learn: 'Apprendre',
      opponentSkills: 'Compétences de l’adversaire',
      hint: 'Les compétences équipées agissent sur tes deux toupies. Apprends-les et améliore-les avec des pièces jusqu’au niveau 10.',
      upgradeAria: 'Améliorer {name} pour {cost} pièces',
      hudAria: '{name}, niveau {n}'
    },
    names: {
      phase_step: 'Pas fantôme',
      guard_shell: 'Coque de garde',
      second_wind: 'Second souffle',
      lucky_edge: 'Lame chanceuse',
      homing_rockets: 'Roquettes guidées',
      opening_salvo: 'Salve d’ouverture',
      momentum: 'Élan',
      hazard_ward: 'Garde anti-danger',
      static_charge: 'Charge statique',
      mirror_plate: 'Plaque miroir'
    },
    desc: {
      phase_step: '{chance} % de chances de traverser un coup ennemi sans dégâts. Recharge {cd} s.',
      guard_shell: 'Commence chaque combat avec un bouclier de {pct} % des PV max. Il absorbe les dégâts avant les PV.',
      second_wind: 'Une fois par combat, quand les PV tombent à {threshold} % ou moins : soigne {pct} % des PV max.',
      lucky_edge: '{chance} % de chances qu’un coup devienne un critique chanceux à ×{mult} dégâts.',
      homing_rockets: 'Tous les {n} chocs avec des ennemis : des roquettes frappent jusqu’à 3 ennemis pour {pct} % d’un coup franc, partagés.',
      opening_salvo: 'Au début du combat, chaque ennemi perd {pct} % de ses PV max.',
      momentum: 'Pendant ton lancer, chaque rebond sur un mur ou coup ajoute +{pct} % de dégâts à tes coups suivants (max. 3).',
      hazard_ward: 'La lave et les auras de foudre font {hazard} % de dégâts en moins, les piquants {chip} % en moins ; les murs électriques te laissent {shock} % de vitesse au lieu de 10 %.',
      static_charge: '{chance} % de chances d’électrocuter un ennemi qui te percute : il s’arrête et passe son prochain tour.',
      mirror_plate: '{chance} % de chances de bloquer la moitié d’un coup ennemi et de la renvoyer.'
    }
  },
  jp: {
    ui: {
      title: 'スキル', slotEmpty: '空き', slotAria: 'スキルスロット{n}', unlockAt: 'ステージ{n}',
      teaser: 'ステージ{n}のボスを倒してスキルを解放しよう！', lockedSkill: 'ステージ{n}のボスを倒すと解放',
      equip: '装備', remove: '外す', equipped: '装備中', max: 'MAX', new: 'NEW', now: '現在', next: '次',
      unlockedTitle: 'スキル解放！', newSkillTitle: '新しいスキル！', newSlotTitle: '新しいスキルスロット！',
      bossDrop: 'このボスを倒すと{name}が解放', learn: '習得', opponentSkills: '相手のスキル',
      hint: '装備したスキルは両方のスピナーに効果があります。コインで習得し、レベル10まで強化できます。',
      upgradeAria: '{cost}コインで{name}を強化', hudAria: '{name}、レベル{n}'
    },
    names: {
      phase_step: 'ファントムステップ',
      guard_shell: 'ガードシェル',
      second_wind: 'セカンドウィンド',
      lucky_edge: 'ラッキーエッジ',
      homing_rockets: 'ホーミングロケット',
      opening_salvo: '開幕砲撃',
      momentum: 'モメンタム',
      hazard_ward: 'ハザードガード',
      static_charge: 'スタティックチャージ',
      mirror_plate: 'ミラープレート'
    },
    desc: {
      phase_step: '{chance}%の確率で敵の攻撃をすり抜け、ダメージを受けない。クールダウン{cd}秒。',
      guard_shell: 'バトル開始時に最大HPの{pct}%のシールドを得る。HPより先にダメージを吸収する。',
      second_wind: 'バトル中1回、HPが{threshold}%以下になると最大HPの{pct}%を回復。',
      lucky_edge: '{chance}%の確率で攻撃がラッキークリティカルになり、×{mult}のダメージ。',
      homing_rockets: '敵と{n}回ぶつかるごとに、ロケットが最大3体の敵に強打の{pct}%分のダメージを分配。',
      opening_salvo: 'バトル開始時、すべての敵が最大HPの{pct}%を失う。',
      momentum: '自分の発射中、壁での跳ね返りや攻撃ごとに以降の攻撃ダメージ+{pct}%（最大3回）。',
      hazard_ward: '溶岩と雷のオーラのダメージ-{hazard}%、トゲ-{chip}%。電撃壁でも速度が10%ではなく{shock}%残る。',
      static_charge: '体当たりしてきた敵を{chance}%の確率で感電させる：敵は止まり、次のターンを休む。',
      mirror_plate: '{chance}%の確率で敵の攻撃の半分を防ぎ、相手に跳ね返す。'
    }
  },
  kr: {
    ui: {
      title: '스킬', slotEmpty: '비어 있음', slotAria: '스킬 슬롯 {n}', unlockAt: '스테이지 {n}',
      teaser: '스테이지 {n} 보스를 물리치고 스킬을 해금하세요!', lockedSkill: '스테이지 {n} 보스를 물리치면 해금',
      equip: '장착', remove: '해제', equipped: '장착됨', max: 'MAX', new: 'NEW', now: '현재', next: '다음',
      unlockedTitle: '스킬 해금!', newSkillTitle: '새 스킬!', newSlotTitle: '새 스킬 슬롯!',
      bossDrop: '이 보스를 물리치면 {name} 해금', learn: '습득', opponentSkills: '상대 스킬',
      hint: '장착한 스킬은 두 스피너 모두에 적용됩니다. 코인으로 습득하고 최대 10레벨까지 강화하세요.',
      upgradeAria: '{cost} 코인으로 {name} 강화', hudAria: '{name}, 레벨 {n}'
    },
    names: {
      phase_step: '페이즈 스텝',
      guard_shell: '가드 셸',
      second_wind: '기사회생',
      lucky_edge: '럭키 엣지',
      homing_rockets: '유도 로켓',
      opening_salvo: '개전 포격',
      momentum: '모멘텀',
      hazard_ward: '위험 방어막',
      static_charge: '정전기 충전',
      mirror_plate: '미러 플레이트'
    },
    desc: {
      phase_step: '{chance}% 확률로 적의 공격을 통과해 피해를 받지 않습니다. 재사용 대기시간 {cd}초.',
      guard_shell: '매 전투 시작 시 최대 HP의 {pct}%만큼 보호막을 얻습니다. HP보다 먼저 피해를 흡수합니다.',
      second_wind: '전투당 한 번, HP가 {threshold}% 이하로 떨어지면 최대 HP의 {pct}%를 회복합니다.',
      lucky_edge: '{chance}% 확률로 공격이 ×{mult} 피해의 행운 치명타가 됩니다.',
      homing_rockets: '적과 {n}번 부딪힐 때마다 로켓이 최대 3명의 적에게 강타의 {pct}%만큼 피해를 나누어 줍니다.',
      opening_salvo: '전투가 시작되면 모든 적이 최대 HP의 {pct}%를 잃습니다.',
      momentum: '발사 중 벽에 튕기거나 적을 맞힐 때마다 다음 공격 피해 +{pct}% (최대 3회).',
      hazard_ward: '용암과 번개 오라 피해 -{hazard}%, 가시 피해 -{chip}%. 전기 벽에 닿아도 속도가 10% 대신 {shock}% 남습니다.',
      static_charge: '나를 들이받은 적을 {chance}% 확률로 감전시킵니다: 적은 멈추고 다음 턴을 쉽니다.',
      mirror_plate: '{chance}% 확률로 적 공격의 절반을 막고 되돌려 줍니다.'
    }
  },
  ru: {
    ui: {
      title: 'Навыки', slotEmpty: 'Пусто', slotAria: 'Слот навыка {n}', unlockAt: 'Этап {n}',
      teaser: 'Победи босса этапа {n}, чтобы открыть навыки!', lockedSkill: 'Открывается после босса этапа {n}',
      equip: 'Надеть', remove: 'Снять', equipped: 'Надето', max: 'МАКС', new: 'НОВОЕ', now: 'Сейчас', next: 'Далее',
      unlockedTitle: 'Навыки открыты!', newSkillTitle: 'Новый навык!', newSlotTitle: 'Новый слот навыка!',
      bossDrop: 'Победи этого босса, чтобы открыть «{name}»', learn: 'Изучить', opponentSkills: 'Навыки соперника',
      hint: 'Надетые навыки действуют на оба спиннера. Изучай и улучшай навыки за монеты до 10 уровня.',
      upgradeAria: 'Улучшить {name} за {cost} монет', hudAria: '{name}, уровень {n}'
    },
    names: {
      phase_step: 'Фазовый шаг',
      guard_shell: 'Защитный панцирь',
      second_wind: 'Второе дыхание',
      lucky_edge: 'Счастливая грань',
      homing_rockets: 'Самонаводящиеся ракеты',
      opening_salvo: 'Первый залп',
      momentum: 'Инерция',
      hazard_ward: 'Защита от стихий',
      static_charge: 'Статический заряд',
      mirror_plate: 'Зеркальная пластина'
    },
    desc: {
      phase_step: '{chance}% шанс пройти сквозь удар врага без урона. Перезарядка {cd} с.',
      guard_shell: 'В начале каждого боя даёт щит в {pct}% от макс. здоровья. Он поглощает урон раньше здоровья.',
      second_wind: 'Раз за бой, когда здоровье падает до {threshold}% или ниже: лечит {pct}% макс. здоровья.',
      lucky_edge: '{chance}% шанс, что удар станет счастливым критом с уроном ×{mult}.',
      homing_rockets: 'Каждые {n} столкновений с врагами: ракеты бьют до 3 врагов на {pct}% сильного удара, поровну.',
      opening_salvo: 'В начале боя каждый враг теряет {pct}% макс. здоровья.',
      momentum: 'Во время твоего запуска каждый отскок от стены или удар даёт +{pct}% урона следующим ударам (макс. 3).',
      hazard_ward: 'Лава и грозовые ауры наносят на {hazard}% меньше урона, шипы — на {chip}% меньше; электростены оставляют тебе {shock}% скорости вместо 10%.',
      static_charge: '{chance}% шанс ударить током врага, который таранит тебя: он останавливается и пропускает следующий ход.',
      mirror_plate: '{chance}% шанс заблокировать половину удара врага и вернуть её обратно.'
    }
  },
  zh: {
    ui: {
      title: '技能', slotEmpty: '空', slotAria: '技能槽 {n}', unlockAt: '第{n}关',
      teaser: '击败第{n}关首领即可解锁技能！', lockedSkill: '击败第{n}关首领后解锁',
      equip: '装备', remove: '卸下', equipped: '已装备', max: 'MAX', new: 'NEW', now: '当前', next: '下一级',
      unlockedTitle: '技能已解锁！', newSkillTitle: '新技能！', newSlotTitle: '新技能槽！',
      bossDrop: '击败此首领解锁{name}', learn: '学习', opponentSkills: '对手的技能',
      hint: '已装备的技能对两个陀螺都生效。用金币学习并升级技能，最高 10 级。',
      upgradeAria: '花费 {cost} 金币升级{name}', hudAria: '{name}，{n} 级'
    },
    names: {
      phase_step: '相位步',
      guard_shell: '守护护盾',
      second_wind: '绝地回生',
      lucky_edge: '幸运之刃',
      homing_rockets: '追踪火箭',
      opening_salvo: '开场齐射',
      momentum: '动量',
      hazard_ward: '灾害结界',
      static_charge: '静电充能',
      mirror_plate: '镜面装甲'
    },
    desc: {
      phase_step: '{chance}% 几率穿过敌人的攻击，不受伤害。冷却 {cd} 秒。',
      guard_shell: '每场战斗开始时获得最大生命值 {pct}% 的护盾，优先于生命值吸收伤害。',
      second_wind: '每场战斗一次：生命值降至 {threshold}% 或以下时，恢复最大生命值的 {pct}%。',
      lucky_edge: '{chance}% 几率使攻击成为幸运暴击，造成 ×{mult} 伤害。',
      homing_rockets: '每与敌人碰撞 {n} 次，火箭攻击最多 3 个敌人，共造成一次重击 {pct}% 的伤害（平分）。',
      opening_salvo: '战斗开始时，每个敌人损失最大生命值的 {pct}%。',
      momentum: '发射期间，每次撞墙反弹或命中都使之后的攻击伤害 +{pct}%（最多 3 层）。',
      hazard_ward: '熔岩和雷电光环伤害降低 {hazard}%，尖刺伤害降低 {chip}%；撞到电击墙后保留 {shock}% 速度（原为 10%）。',
      static_charge: '{chance}% 几率电击撞向你的敌人：它会停下并跳过下一回合。',
      mirror_plate: '{chance}% 几率挡住敌人攻击的一半并反弹回去。'
    }
  }
}

/** i18n interpolation params per skill (what the picker passes to t()). */
export const DESC_PARAMS = {
  phase_step: '`chance` = chance×100 (1 decimal max), `cd` = cooldownMs/1000 (1 decimal)',
  guard_shell: '`pct` = shield×100',
  second_wind: '`threshold` = 35, `pct` = heal×100',
  lucky_edge: '`chance`, `mult` (2 decimals, trailing zeros trimmed)',
  homing_rockets: '`n` = everyN, `pct` = frac×100',
  opening_salvo: '`pct`',
  momentum: '`pct` = perStack×100 (1 decimal)',
  hazard_ward: '`hazard` = lava×100, `chip` = chip×100, `shock` = round((0.1 + 0.9×shockKeep)×100)',
  static_charge: '`chance`',
  mirror_plate: '`chance`'
}

/** One-line L10 summary per skill for the TL;DR table. */
export const L10_LINE = {
  phase_step: '10 % chance to take 0 from an enemy hit (+300 ms phase), 2.5 s cooldown',
  guard_shell: 'battle-start shield = 16 % of max HP',
  second_wind: 'once per battle at ≤ 35 % HP: heal 18 % of max HP',
  lucky_edge: '13 % of non-crit hits deal ×2.0',
  homing_rockets: 'every 5 enemy contacts: rockets for 17 % of a reference hit, split over ≤ 3 enemies',
  opening_salvo: 'battle start: every enemy loses 14 % of max HP (non-lethal)',
  momentum: 'in own launch: +7.5 % hit damage per wall/bouncer rebound or hit, max 3 stacks',
  hazard_ward: 'lava/thunder aura −40 %, Spiky chip −15 %, keeps 19 % speed on shock (vs 10 %)',
  static_charge: '18 % chance: an enemy ramming you stops and skips its next turn',
  mirror_plate: '16 % chance: take half of an enemy hit, send half ÷ its defence back'
}
