# Tree Smashers — translation guide

Everything a translator needs to add or finish one language. The infrastructure
(detection, lazy loading, fonts, RTL, the language picker) is done: **a language
is a single file**, `src/i18n/locales/<code>.ts`. When that file exists the
language is selectable, detected from the portal/browser, and lazy-loaded as its
own chunk. Nothing else needs editing.

## 1. The language set

The union of the Playgama developer-cabinet language list (23) and the Wavedash
Developer Portal language list (35) — 39 languages. The registry with every
code, autonym, script and direction is `src/i18n/languages.ts`.

| code  | language              | autonym              | script bucket | dir     | Playgama form | Wavedash form         |
|-------|-----------------------|----------------------|---------------|---------|---------------|-----------------------|
| en    | English               | English              | latin         | ltr     | EN            | English               |
| de    | German                | Deutsch              | latin         | ltr     | DE            | German                |
| es    | Spanish               | Español              | latin         | ltr     | ES            | Spanish               |
| fr    | French                | Français             | latin         | ltr     | FR            | French                |
| it    | Italian               | Italiano             | latin         | ltr     | IT            | Italian               |
| pt-BR | Portuguese (Brazil)   | Português (Brasil)   | latin         | ltr     | PT_BR         | Portuguese (Brazil)   |
| pt-PT | Portuguese (Portugal) | Português (Portugal) | latin         | ltr     | PT_PT         | Portuguese            |
| nl    | Dutch                 | Nederlands           | latin         | ltr     | NL            | Dutch                 |
| id    | Indonesian            | Bahasa Indonesia     | latin         | ltr     | ID            | Indonesian            |
| sv    | Swedish               | Svenska              | latin         | ltr     | —             | Swedish               |
| nb    | Norwegian (Bokmål)    | Norsk bokmål         | latin         | ltr     | —             | Norwegian             |
| da    | Danish                | Dansk                | latin         | ltr     | —             | Danish                |
| fi    | Finnish               | Suomi                | latin         | ltr     | —             | Finnish               |
| ca    | Catalan               | Català               | latin         | ltr     | —             | Catalan               |
| gl    | Galician              | Galego               | latin         | ltr     | —             | Galician              |
| pl    | Polish                | Polski               | latin-ext     | ltr     | PL            | Polish                |
| tr    | Turkish               | Türkçe               | latin-ext     | ltr     | TR            | Turkish               |
| vi    | Vietnamese            | Tiếng Việt           | latin-ext     | ltr     | VI            | Vietnamese            |
| az    | Azerbaijani           | Azərbaycanca         | latin-ext     | ltr     | AZ            | —                     |
| uz    | Uzbek (Latin)         | Oʻzbekcha            | latin-ext     | ltr     | UZ            | —                     |
| cs    | Czech                 | Čeština              | latin-ext     | ltr     | —             | Czech                 |
| hr    | Croatian              | Hrvatski             | latin-ext     | ltr     | —             | Croatian              |
| ro    | Romanian              | Română               | latin-ext     | ltr     | —             | Romanian              |
| hu    | Hungarian             | Magyar               | latin-ext     | ltr     | —             | Hungarian             |
| lv    | Latvian               | Latviešu             | latin-ext     | ltr     | —             | Latvian               |
| lt    | Lithuanian            | Lietuvių             | latin-ext     | ltr     | —             | Lithuanian            |
| eo    | Esperanto             | Esperanto            | latin-ext     | ltr     | —             | Esperanto             |
| el    | Greek                 | Ελληνικά             | greek         | ltr     | —             | Greek                 |
| ru    | Russian               | Русский              | cyrillic      | ltr     | RU            | Russian               |
| uk    | Ukrainian             | Українська           | cyrillic      | ltr     | UA            | Ukrainian             |
| bg    | Bulgarian             | Български            | cyrillic      | ltr     | —             | Bulgarian             |
| kk    | Kazakh (Cyrillic)     | Қазақ тілі           | cyrillic      | ltr     | KK            | —                     |
| ar    | Arabic                | العربية              | arabic        | **rtl** | AR            | Arabic                |
| hi    | Hindi                 | हिन्दी               | devanagari    | ltr     | HI            | —                     |
| th    | Thai                  | ไทย                  | thai          | ltr     | TH            | Thai                  |
| jp    | Japanese              | 日本語                  | cjk-jp        | ltr     | JA            | Japanese              |
| kr    | Korean                | 한국어                  | cjk-kr        | ltr     | KO            | Korean                |
| zh    | Chinese (Simplified)  | 简体中文                 | cjk-sc        | ltr     | ZH            | Chinese (Simplified)  |
| zh-TW | Chinese (Traditional) | 繁體中文                 | cjk-tc        | ltr     | — (ZH)        | Chinese (Traditional) |

`jp`, `kr`, `zh` are legacy internal codes (they live in players' saves); the
real BCP-47 tags (`ja`, `ko`, `zh-Hans`, `zh-Hant`) are applied to `<html lang>`
automatically. `zh-TW` is written in **Taiwan-standard Traditional Chinese**
(it also serves zh-HK / zh-MO). `pt-BR` also serves a bare `pt` tag (most
portals send only `pt`); `pt-PT` serves Portugal and the African/Asian `pt-XX`
regions.

**Tick the store forms when a language ships:** Playgama cabinet →
`supportedLanguages`; Wavedash Developer Portal → Metadata → Languages.

## 2. Workflow for one language

```bash
# 1. Scaffold the file: every key, English values, correct structure
node scripts/i18n-scaffold-locale.mjs it

# 2. Translate every value in src/i18n/locales/it.ts (keys never change)

# 3. Gate — must be green. Lists every missing / English / broken string.
npx vitest run tests/i18nParity.test.ts -t "\[it\]"
#    (bash alternative)        I18N_LOCALES=it npx vitest run tests/i18nParity.test.ts
#    (PowerShell alternative)  $env:I18N_LOCALES='it'; npx vitest run tests/i18nParity.test.ts

# 4. Look at it in the real game (3 viewports x 6 screens, ~2 min)
node scripts/l10n-screenshots.mjs --locale it
#    then OPEN the PNGs it lists: clipped captions, wrapped buttons, tofu (□),
#    text leaving a badge, mixed fonts inside one word.

# 5. Later, when en.ts / a component gains keys: add them (English) and translate
node scripts/i18n-scaffold-locale.mjs it --sync
```

On this machine wrap test / screenshot runs in the worker budget:
`node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- <command>`.

### File format

```ts
// src/i18n/locales/it.ts
export default {
  'stages': { 'stage_1': 'Prato soleggiato', … },   // same tree as en.ts
  'spinner': { 'youWin': 'HAI VINTO!', … },
  …
  'sfc': {                                              // component copy
    'OptionsModal': { 'language': 'Lingua', … },       // = en.ts sfc.OptionsModal
    'BattlePass': { … },
    …
  }
}
```

- One source of English: **`en.ts`** — global keys plus the component copy
  under `sfc.<ComponentName>`. Every language, the original eight included,
  keeps its component copy in its own file, so it loads lazily; components read
  it with `useSfcI18n('<ComponentName>')` (`src/i18n/sfc.ts` explains why and
  how). There are no SFC `<i18n>` blocks — do not add one: it would ship every
  language in the first-load bundle.
- Single-quoted strings; escape an apostrophe as `\'` (`'l\'arena'`). Keep the
  file a plain object literal — no imports, no functions, no computed keys.
- Never rename, add or drop keys by hand; `--sync` does that.

## 3. Glossary — how the existing languages say it

Reuse these decisions for consistency; the Arabic column is the pilot.

| key                                                     | en                    | de                         | es                       | fr                        | jp             | kr               | ru                          | zh           | ar                          |
|---------------------------------------------------------|-----------------------|----------------------------|--------------------------|---------------------------|----------------|------------------|-----------------------------|--------------|-----------------------------|
| `spinner.spinnerLabel`                                  | Spinner {n}           | Spinner {n}                | Peonza {n}               | Toupie {n}                | スピナー{n}        | 스피너 {n}          | Спиннер {n}                 | 陀螺 {n}       | سبينر {n}                   |
| `sfc.SpinnerConfigModal.bladeLabel`                     | Blade                 | Blade                      | Peonza                   | Toupie                    | ブレード           | 블레이드             | Волчок                      | 陀螺           | شفرة                        |
| `sfc.SpinnerConfigModal.topBlade`                       | Top Blade             | Obere Klinge               | Parte superior           | Partie haute              | アッパー           | 상단 파츠            | Верхняя часть               | 上部           | الشفرة العلوية              |
| `sfc.SpinnerConfigModal.bottomPart`                     | Bottom Part           | Unterteil                  | Parte inferior           | Partie basse              | ボトム            | 하단 파츠            | Нижняя часть                | 下部           | القطعة السفلية              |
| `stage`                                                 | Stage                 | Etappe                     | Etapa                    | Étape                     | ステージ           | 스테이지             | Этап                        | 关卡           | المرحلة                     |
| `bossStage`                                             | Boss Stage            | Boss-Etappe                | Etapa Jefe               | Étape Boss                | ボスステージ         | 보스 스테이지          | Этап Босса                  | 首领关卡         | مرحلة الزعيم                |
| `bossPeek.nextBoss`                                     | Next boss · Stage {n} | Nächster Boss · Etappe {n} | Próximo jefe · Etapa {n} | Prochain boss · Étape {n} | 次のボス · ステージ{n} | 다음 보스 · 스테이지 {n} | Следующий босс · Этап {n}   | 下个首领 · 第{n}关 | الزعيم التالي · المرحلة {n} |
| `pvp.arena`                                             | Arena                 | Arena                      | Arena                    | Arène                     | アリーナ           | 아레나              | Арена                       | 竞技场          | الحلبة                      |
| `spinner.coins`                                         | Coins                 | Münzen                     | Monedas                  | Pièces                    | コイン            | 코인               | Монеты                      | 金币           | عملات                       |
| `sfc.RewardedAdIntroModal.rewardedIntro.rewardDiamonds` | {count} diamonds      | {count} Diamanten          | {count} diamantes        | {count} diamants          | ダイヤ {count} 個  | 다이아 {count}개     | {count} алмазов             | {count} 钻石   | {count} ماسة                |
| `sfc.SpinnerConfigModal.selectSkin`                     | Select Skin           | Skin auswählen             | Elegir skin              | Choisir un skin           | スキン選択          | 스킨 선택            | Выбрать скин                | 选择皮肤         | اختر المظهر                 |
| `sfc.BattlePass.battlePass`                             | Battle Pass           | Battle Pass                | Pase de Batalla          | Battle Pass               | バトルパス          | 배틀 패스            | Боевой пропуск              | 战斗通行证        | تذكرة المعركة               |
| `sfc.BattlePass.honorTrack`                             | Honor Track           | Ehren-Track                | Pista de Honor           | Piste d'Honneur           | 名誉トラック         | 명예 트랙            | Путь Чести                  | 荣誉通道         | مسار الشرف                  |
| `sfc.BattlePass.honorAbbr`                              | HP                    | EP                         | PH                       | PH                        | 名誉P            | 명예P              | ОЧ                          | 荣誉点          | ن.ش                         |
| `leaderboard.title`                                     | Leaderboard           | Bestenliste                | Clasificación            | Classement                | ランキング          | 순위표              | Таблица лидеров             | 排行榜          | لوحة الصدارة                |
| `spinner.youWin`                                        | YOU WIN!              | DU GEWINNST!               | ¡GANASTE!                | VICTOIRE !                | 勝利！            | 승리!              | ПОБЕДА!                     | 胜利！          | لقد فزت!                    |
| `spinner.youLose`                                       | YOU LOSE!             | DU VERLIERST!              | ¡PERDISTE!               | DÉFAITE !                 | 敗北！            | 패배!              | ПОРАЖЕНИЕ!                  | 失败！          | لقد خسرت!                   |
| `spinner.rewards`                                       | REWARDS               | BELOHNUNGEN                | RECOMPENSAS              | RÉCOMPENSES               | 報酬             | 보상               | НАГРАДЫ                     | 奖励           | المكافآت                    |
| `spinner.surrender`                                     | Surrender?            | Aufgeben?                  | ¿Rendirse?               | Abandonner ?              | 降参しますか？        | 항복하시겠습니까?        | Сдаться?                    | 投降？          | استسلام؟                    |
| `spinner.yourTurn`                                      | Your Turn             | Dein Zug                   | Tu turno                 | Votre tour                | あなたのターン        | 내 턴              | Ваш ход                     | 你的回合         | دورك                        |
| `sfc.DailyRewards.dailyRewards`                         | Daily Rewards         | Tägliche Belohnungen       | Recompensas diarias      | Récompenses quotidiennes  | デイリー報酬         | 일일 보상            | Ежедневные награды          | 每日奖励         | المكافآت اليومية            |
| `parts.star`                                            | Star Blade            | Sternklinge                | Cuchilla estelar         | Lame étoile               | スターブレード        | 스타 블레이드          | Звёздный клинок             | 星刃           | شفرة النجمة                 |
| `parts.piercer`                                         | Tank Piercer          | Panzerbrecher              | Perforador               | Perce-blindage            | アーマーブレイク       | 관통자              | Бронебой                    | 穿甲者          | خارق الدروع                 |
| `parts.tanky`                                           | Tanky                 | Robust                     | Tanque                   | Résistant                 | タンク            | 탱커               | Танк                        | 坦克           | المدرّع                     |
| `lv`                                                    | Lv.                   | Lv.                        | Nv.                      | Nv.                       | Lv.            | Lv.              | Ур.                         | Lv.          | Lv.                         |
| `sfc.BGSkinModal.bg.title`                              | Backgrounds           | Hintergründe               | Fondos                   | Arrière-plans             | 背景             | 배경               | Фоны                        | 背景           | الخلفيات                    |
| `tapToContinue`                                         | Tap to continue       | Tippen zum Fortfahren      | Toca para continuar      | Appuyez pour continuer    | タップして続行        | 탭하여 계속하기         | Коснитесь, чтобы продолжить | 轻触屏幕继续       | المس للمتابعة               |
| `skinChest.acquired`                                    | {name} Acquired!      | {name} erhalten!           | ¡{name} conseguido!      | {name} obtenu !           | {name}を獲得！     | {name} 획득!       | {name} получен!             | 获得{name}！    | حصلت على {name}!            |

What the terms mean in the game:

- **Spinner** — the player's fighting top; a team has 1–3. A spinner is built
  from a **top blade** (attack part: Star Blade, Spiky, Round Guard, Quad Core,
  Soft Shell, Tank Piercer) and a **bottom part** (movement: Speedy, Tanky,
  Balanced). The player flicks spinners like a slingshot. Use your language's
  word for a spinning top / battle top, or the loanword players know from
  Beyblade-style games. `Blade` in the tabs ("Blade 1") means one spinner.
- **Stage** — one of 100 campaign levels. Every 5th is a **boss** stage; the
  `stages.*` values are arena/boss names in a cosy plush-forest tone (a meadow,
  a snowy glade, a toy-box corner; bosses are playful-menacing plush animals,
  "The Masked Raccoon") — translate them as short, playful names, not
  literally word by word, and keep them as short as the stage badge allows
  (≈ 22 characters). **Arena** — the round battlefield; `arenas.*` are
  arena types (Lava, Ice, Forest, Thunder, Shock).
- **Stage-101+ bosses** — `stages.boss_*` are encounter names shown on the
  boss intro card and the stage badge; the game appends a Roman numeral on a
  repeat meeting ("… II"), so write a name that reads well with one. Keep them
  ≤ 1.4 × English. `bosses.traits.*` are the boss mechanics (Ember Nova = a
  fire burst, Frost Lock = freezes a spinner for its next turn, Frostbite = a
  stacking slow); they are only read as a tooltip / screen-reader label.
  `bosses.frozenHint` is one HUD line under the arena — keep it ≤ 1.3 × English.
  The trophy skins (`skins.cinder` / `frost-vault` / `yeti`) and `trophySkin.*`
  are earn-only rewards; "Yeti" may stay as the native word (allowlist it).
- **Coins** (soft currency) and **diamonds** (premium currency). **Skins** —
  cosmetic looks for a top blade; `skins.*` are their names (creature, element
  or object names — translate them; a name that is a proper noun or is used as
  a loanword in your language may stay, allowlist it).
- **Battle Pass** — XP track with rewards; **Honor Track** — the PvP reward
  track, paid in **Honor Points** (`honorAbbr` is its 1–4 character
  abbreviation, shown after a number).
  **Daily Rewards** — log-in calendar (`dayShort` = "D{n}" = day badge).
- **Leaderboard** — global ranking; `leaderboard.score` is the stage reached.
- `easy` / `medium` / `hard` in OptionsModal are difficulty NAMES (Novice /
  Squire / Master) — keep them as rank titles, not "easy/normal/hard".
- `QuestReward` copy mentions cards; it is legacy text from a sister game —
  translate it as written.
- **League tiers** (`league.tiers.*`) — the PvP ranks Wood → Champion. Use the
  words ranked games in your language already use. `tierDivision` is the tier
  plus a Roman numeral ("Gold II"); `tierPosition` is Champion plus its
  leaderboard position ("Champion #12") — reorder or add a rank word as your
  language needs, keep both placeholders.
  **Open native check (zh / zh-TW):** `platinum` is 铂金 in `zh` and 白金 in
  `zh-TW` — both are used in games. A native speaker should confirm which one
  each market's players expect before release; until then leave them as is.

## 4. Tone

Casual, energetic, short — a mobile arcade game for ages 13+. Use the informal
"you" where the language has one (du / tú / tu / ты / sen / あなた-less
phrasing) the way the existing de/es/fr/ru files do. Exclamation marks where
English has them; no slang that dates fast. Prefer the word players see in
other games over a dictionary coinage.

## 5. Length limits

The UI is sized for English at phone width. Rules of thumb, in characters,
for Latin/Cyrillic/Greek (CJK: about half):

| kind                                                       | keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | limit                                                                   |
|------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| badges, tags, table heads                                  | `lv`, `spinner.ad`, `vs`, `you`, `stage`, `sfc.BattlePass.max`/`complete`/`honorAbbr`, `sfc.DailyRewards.dayShort`/`collectCta`, `sfc.BGSkinModal.bg.equipped`/`equippedShort`/`select`/`buy`, `sfc.SpinnerConfigModal.equipped`/`selectButton`/`bladeLabel`, `sfc.CombatLog.short`, `sfc.InAppPurchaseShop.shop.popular`/`bestValue`, `leaderboard.player`/`score`/`power`/`you`, `pvp.wins`/`losses`/`honor`/`host`/`guest`/`join`/`copy`/`leave`, `prev`/`next`/`page`, `spinner.skip`/`surrenderCancel`/`surrenderQuit` | **≤ 10**, and never longer than 1.5 × English                           |
| button captions                                            | `continue`, `close`, `cancel`, `spinner.playAgain`/`buildTeam`/`spinAgain`, `sfc.OptionsModal.close`/`resetCampaign`/`reset`, `pvp.createLobby`/`joinLobby`/`startMatch`/`copyLink`/`setReady`, `sfc.RewardedAdIntroModal.rewardedIntro.watch`/`decline`, `sfc.AdsBlockedModal.adsBlocked.gotIt`, `sfc.SaveStatusBanner.save.retry`/`dismiss`                                                                                                                                                                               | **≤ 18**, one line                                                      |
| names in cards and badges (truncated with … when too long) | `parts.*`, `sfc.CombatLog.types.*`, `skins.*`, `sfc.BGSkinModal.bg.skins.*`, `arenas.*`, `elements.*`, `stages.*`                                                                                                                                                                                                                                                                                                                                                                                                           | **≤ 20** (`parts.*`, `arenas.*`, `bg.skins.*` truncate — ≤ 14 is safer) |
| headlines and modal titles (title ribbons do not wrap)     | `spinner.youWin`/`youLose`/`rewards`, `leaderboard.title`, `sfc.DailyRewards.dailyRewards`, `sfc.BattlePass.battlePass`/`honorTrack`, `sfc.OptionsModal.options`/`language`, `sfc.BGSkinModal.bg.title`, `sfc.InAppPurchaseShop.shop.title`, `sfc.FakeLeaderBoard.leaderboard`, `sfc.CombatLog.title`                                                                                                                                                                                                    | **≤ 16**                                                                |
| sentences (wrap)                                           | `tips.*`, hints, `*.body`, `*Note`, `*.desc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ≤ 1.3 × English                                                         |

If a natural translation is longer, shorten the wording (drop articles, use the
common abbreviation) rather than letting it wrap. The screenshot script shows
the result; overflow flags appear in its output and `report.json`.

## 6. Placeholders, plurals, escaping

- **Placeholders** `{n}`, `{name}`, `{count}`, `{reward}`, `{host}`,
  `{attacker}`, `{dmg}`, `{target}`, `{type}` must appear exactly as in English
  — same names, none added, none dropped. Move them wherever your grammar
  needs; never translate the name inside the braces.
- **vue-i18n special characters.** In a translation these are syntax:
    - `{` `}` — placeholders only. A literal brace: `{'{'}` / `{'}'}`.
    - `@` — starts a linked message. A literal at-sign: `{'@'}`.
    - `|` — separates **plural branches**. A literal pipe: `{'|'}`.
    - `%` and `$` are plain text.
      The parity test rejects a bare `@` or `|`.
- **Plurals.** The English copy is written number-neutral ("reward(s)",
  "{n} stages away"). **Exception:** the coin-count aria labels
  (`skills.learnAria`, `skills.upgradeAria`, `skills.topUpAria`,
  `spinner.tripleCoinsAria`) DO use `a | b` branches — English `coin | coins`,
  and every language one branch per category below (ar may spell out one/two).
  Everywhere else, rephrase so the number does not need agreement — e.g. "Rewards ready:
  {n}!", "Stages left: {n}", "Season resets in: {n} d". Only if that is
  impossible use branches, one per whole-number CLDR category of your language
  (optionally plus a leading explicit-zero branch); the runtime picks them via
  `Intl.PluralRules` (`pluralRuleFor` in `languages.ts`):

  | branches | languages |
    |---|---|
  | 1 (`other`) | id, vi, th, jp, kr, zh, zh-TW |
  | 2 (`one \| other`) | en, de, es, fr, it, pt-BR, pt-PT, nl, sv, nb, da, fi, ca, gl, tr, az, uz, hu, eo, el, bg, kk, hi |
  | 3 (`one \| few \| many`) | ru, uk, pl |
  | 3 (`one \| few \| other`) | cs, hr, ro, lt |
  | 3 (`zero \| one \| other`) | lv |
  | 6 (`zero \| one \| two \| few \| many \| other`) | ar |

- **Casing.** Keep the casing of the English source (`YOU WIN!` is written in
  capitals; most other labels are uppercased by CSS). Uppercasing is
  language-aware via `<html lang>` (Turkish/Azerbaijani `i → İ`, Greek drops
  accents), so write natural case where English does.
- **Quotes / apostrophes.** Use your language's own quotation marks (« », „ “,
  「 」). Uzbek writes `oʻ gʻ` with U+02BB (ʻ), not an apostrophe.

## 7. What stays in English

- `gameName` ("Tree Smashers") and `pvp.shareTitle` ("Tree Smashers PvP") — the
  product name is never translated, in any script.
- `vs` ("VS") and `leaderboard.rank` ("#").
- Brand and platform names inside sentences: CrazyGames, WhatsApp, PvP, XP
  (may be localized if your players say it differently, e.g. Arabic "خبرة").
- `sfc.BGSkinModal.bg.skins.prism` ("K-Pop") may stay.
- Everything else is translated. When a word really is identical in your
  language (a cognate or loanword: "Arena", "Ninja", "Tsunami", "Ok"), add the
  key to your language's list in `tests/i18nParity.allowlist.ts` (the
  `KEEP_ENGLISH` map) — that is also how `Lv.` stays in jp/kr/zh/ar.

## 8. Script notes

Fonts are handled for every script (`src/assets/css/fonts.sass`). The UI face
**Nunito** (self-hosted, OFL, rounded) covers Latin, latin-ext (incl.
Vietnamese) and Cyrillic; **Greek renders in Playpen Sans** (Nunito has no
Greek) — both subset per script by `scripts/subset-display-font.mjs` and downloaded only
when such a locale is active — and **Arabic, Devanagari and Thai render in a
clean system sans** (zero download). That is intended, not a bug. What
translators must do:

- **Arabic (RTL).** The layout and the HUD stay left-to-right; every text box
  takes its direction from its FIRST strong letter (`unicode-bidi: plaintext`).
  So an Arabic string must **start with an Arabic word**. If it has to start
  with a Latin word (a brand, "PvP", "XP"), prefix it with U+200F
  RIGHT-TO-LEFT MARK (`'‏' + …` written as the literal character or
  `‏` inside the quotes). Placeholders and digits do not count as strong
  letters. The parity test enforces this. Use Western digits (the game formats
  numbers itself). No tatweel (ـ) stretching, no letter-spacing tricks.
- **CJK.** Full-width punctuation (！？：、) as the existing jp/kr/zh do; no
  spaces between words (Korean: normal spacing). Traditional Chinese (`zh-TW`)
  is a separate translation — do not machine-convert `zh`; use Taiwan
  vocabulary (e.g. 遊戲 not 游戏, 金幣, 排行榜, 登入).
- **Thai.** No spaces between words (the browser breaks lines with a
  dictionary); a space marks a phrase/sentence pause. Do not insert zero-width
  spaces.
- **Hindi.** Devanagari with Western digits; English gaming loanwords in
  Devanagari (स्पिनर, बॉस) are normal.
- **Vietnamese.** Full diacritics always; keep labels short — Vietnamese runs
  long.
- **Kazakh** — Cyrillic (the language's official Latin switch is not in use in
  games yet). **Uzbek** — Latin (official since 1993).
- **Norwegian** — Bokmål (`nb`); the file also serves `no` / `nn` tags.
- **Portuguese** — `pt-BR` (você, "tela") and `pt-PT` (tu/você per European
  usage, "ecrã") are separate files; write each in its own norm.

## 9. The gates, in order

1. `npx vitest run tests/i18nParity.test.ts -t "\[<code>\]"` — green. It checks,
   against English: every global and component key present, no extras, same
   placeholders and linked refs, no empty strings, no bare `@`/`|`, plural
   branch counts, nothing left identical to English unless allowlisted,
   non-Latin locales actually contain their script, and the Arabic RLM rule.
   Pending languages show as `todo`, not failures.
2. `node scripts/l10n-screenshots.mjs --locale <code>` — then open every PNG.
   Check: no tofu (□), no caption wrapping inside a button, no text leaving a
   badge or card, headline ribbons fit, letters joined (Arabic) and one font
   per word. The run also prints `booted "<x>", expected "<code>"` if the
   locale did not load, and flags sideways page scroll / overflowing boxes.
3. `node scripts/l10n-screenshots.mjs --browser-lang <tag> --screens menu`
   (optional) — detection: with no stored choice, a browser in `<tag>` (e.g.
   `pt-PT`, `zh-HK`, `nb-NO`) must boot your file.

The screenshot script starts its own Vite dev server on a random port, checks
the served `<title>` is "Tree Smashers", and drives its own headless Chrome with a
throwaway profile — it never touches a browser you have open. PNGs and
`report.json` go to `<os tmp>/tree-smashers-l10n/<code>/` unless `--out` is given.
Options: `--screens menu,options,language,config,battle,win`,
`--viewports mobile-landscape,mobile-portrait,desktop`.

## 10. How detection works (for reviewers)

`toShippedLocale()` (`src/i18n/index.ts`, rules in `languages.ts`) maps any
portal or browser tag onto a shipped file: region/script aware (`pt` /
`pt-BR` → pt-BR, `pt-PT`/`pt-AO` → pt-PT, `zh-Hant`/`zh-TW`/`zh-HK` → zh-TW,
`zh`/`zh-CN`/`zh-Hans-HK` → zh), ISO 639-2 codes (`ara`, `jpn`), legacy and
country-style codes (`ja`→jp, `ko`→kr, `ua`→uk, `kz`→kk, `no`/`nn`→nb,
`in`→id), and the nearest sibling when a variant is not shipped yet
(zh-TW → zh, pt-PT ↔ pt-BR). Unshipped languages return null so they can never
override the player's choice. Sources: CrazyGames `systemInfo.locale`,
Playgama Bridge `platform.language` (also YouTube Playables and every other
Bridge platform), Poki `getLanguage()`, and `navigator.languages` on
GameDistribution, GamePix, Wavedash, itch, Y8, Glitch and the native app. An
explicit choice in the picker always wins, except when the portal language
actively changes (see `notePortalLanguageChange`).
