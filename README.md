# Echo Check+

Four claps in a browser tab: a classroom echo estimate against the ANSI/ASA S12.60 limit that says "no verdict" rather than risk a false pass.

**Live app:** https://kniggukniggu-droid.github.io/echo-check/app/

**Try it without a microphone:** open the live app and press **Try a sample room**.

**Devpost entry:** https://devpost.com/software/stemurgent-placeholder · **Demo video (captioned, 2 min):** https://youtu.be/nGnA-5pFyyM

Built for STEMergent Hacks 2026 by William and Kartikeya.

## 1. The problem

Echo (reverberation) makes speech harder to follow in a classroom.

- ANSI/ASA S12.60-2010 Part 1, the American National Standard for classroom acoustics, sets a maximum echo time for an unoccupied, furnished classroom: 0.6 s up to 10,000 ft³, and 0.7 s from 10,000 to 20,000 ft³. The standard is voluntary unless a state or district adopts it.
- In a survey of 220 K-12 classrooms in five districts in Iowa and Nebraska, 15 % did not meet the 0.6 s limit, and 91 % had unoccupied background noise above the 35 dBA limit (Brill, Smith and Wang, *Acoustics Today* 14(3), 2018; districts per Brill and Wang, *Frontiers in Built Environment* 7:688395, 2021).
- The American Academy of Audiology's 2011 hearing-assistance-technology guideline (Supplement B) describes a room check that measures reverberation at 500, 1000 and 2000 Hz from an impulse, such as a popped balloon or clapped boards. In a survey of 34 educational audiologists, 88 % were unsure about or had no access to equipment to measure reverberation time (Latham and Blumsack, *Journal of Educational Audiology* 14, 2007/2008).

### Who it is for

- **Educational audiologists who do assistive-technology (AT) evaluations.** Under IDEA, an AT service includes "a functional evaluation of the child in the child's customary environment" (34 CFR 300.6(a)). The classroom is that environment. Echo Check+ is a tool for the reverberation step of the AAA room check, at one seat (the guideline uses five positions).
- **Teachers.** A teacher who finds a room hard to talk in gets an estimate and a next step: ask the school's educational audiologist or facilities manager for a proper measurement.

### Why existing options fall short

- **A full measurement needs an acoustical consultant.** Erin C. Schafer, an audiology department chair, told us: *"It's very unlikely funding would even exist for this request in public schools (very tight budgets!)."*
- **Clap apps exist, but they do not check the microphone.** Clap-based echo checks are not new. Spratford, Walker and McCreery (2019) measured 164 classrooms with a hand clap and an app. In a search on 13 and 15 November 2026 we found free clap apps for phones (Akustikkollen, ClapIR, ClapReverb) and a browser tool that checks uploaded impulse responses against S12.60 (AcoustiVision Pro). We found no free web page that records claps live, compares the result with S12.60 and blocks the verdict when the browser reports microphone processing. This is what we found, not proof that none exists.
- **Free noise apps do not measure echo.** The NIOSH sound level meter app measures noise only (team research notes).
- **A laptop microphone can hide the echo.** Browsers can apply noise suppression, echo cancellation and gain control. Microsoft says Windows Voice Clarity is "enabled by default" and "minimizes reverberation" (Microsoft Support, "Inside this update"). In our browser test (Chrome's real processing applied to recorded test takes through a fake microphone), the processing moved the echo time by up to −17.8 %, and the audio alone did not reveal it.

## 2. How to use it

1. Open the live app in Chrome on a laptop. Enter the room's length, width and height. The limit depends on the room volume.
2. Turn off microphone effects. The page lists the settings for your system, for example Windows Voice Clarity. Close other apps and tabs that use the microphone.
3. Put the device on a student desk about 3–5 m (10–16 ft) from where you will clap. Keep the room empty and quiet: close the door and windows, switch off fans and the projector, and pause the ventilation if you are allowed to.
4. Press **Start recording** and walk quietly to the front. The page counts you in for each clap ("Clap 1 of 4 in 3… 2… 1… CLAP NOW"), 4 claps, 4 s apart: clap with cupped hands, as loud as you comfortably can. When the page asks, count aloud in your normal teaching voice, and stop when it says "Stop talking". The recording stops by itself after 45 seconds.
5. Read the verdict, the microphone trust badge and the next step. Copy the report sentence, or print the result or save it as a PDF.

The audio never leaves the device. The analysis runs in the browser. The page plays no sound.

## 3. What makes it different

An acoustics consultant named the one harm for a tool like this: a false pass. A **false pass** is an "Under the limit" result for a room whose reference value is over the limit or too close to call. Echo Check+ follows four rules to avoid it. Each rule has a demo button under **Try a sample room** (named in brackets below). The page never gives a bare pass or fail. It gives one of five verdicts: Likely over the limit / Too close to call / Under the limit (weak evidence) / Incomplete / Blocked.

1. **It refuses to guess.** Each band needs at least 2 claps with at least 30 dB of clean decay (how far the clap's echo falls before it reaches the background noise). Otherwise the result is "Incomplete". The page names the band, the level reached and what to change. *Borrowed:* ISO 3382-2 practice requires enough decay range above the noise; Hak, Wenmaekers and van Luxemburg (2012) support 37 dB for full confidence. *Ours:* the range rule becomes a plain result with a fix, and we publish the Incomplete rate next to every false-pass count. [Demo: "Quiet claps: treated room".]
2. **Weak evidence points one way only.** When the claps are too quiet for T20, the early decay (EDT) can still say "Likely over the limit", with lower confidence. It needs the 3-band EDT average at 1.3 × the limit or more, and every band at or above the limit. It can never say "Under". EDT read 4.9 % shorter than T20 (median, 437 test takes), so a high EDT is safe evidence of "over", and a low EDT is no evidence of "under". *Borrowed:* guarded rejection, JCGM 106:2012 §8.3.3 (measurement uncertainty in conformity assessment). *Result:* in every test set (simulated claps), no early-decay result came from a room close to or under the limit. [Demo: "Quiet claps: echoey room".]
3. **It checks its own microphone.** The page asks the browser to turn processing off. It then reads back what the browser reports with `getSettings()`, the standard Media Capture call. It blocks the verdict (red badge) when the browser reports processing on, or when the audio shows clipping or a noise-gate sign. *Ours:* the browser's report is a gate on a measurement verdict. *Evidence:* in headless Chrome, the browser's report caught Chrome's processing in 14 of 14 runs; our audio-only checks caught 0 of 14. The page cannot see operating-system processing, so the setup step lists those settings. [Demo: "Browser filtering on".]
4. **A pass needs a margin.** "Under the limit (weak evidence)" needs the 3-band average more than 15 % below the limit. Within ±15 % of the limit, the result is "Too close to call". A per-band guard turns "Under" into "Too close to call" when any single band is over the limit. *Borrowed:* guarded acceptance, JCGM 106:2012 §8.3.2. An audiology professor on the S12.60 committee said of the ±15 % band: *"That error band sounds good."* [Demo: "Uneven room: one band over"; the echo-time bar shows the zone as stripes.]

**A sentence for a report.** For an AT evaluation, the result page writes one sentence to copy. It says "an estimate", never "complies". It gives the date, the room size, the per-band values and the limit. For an "Under" result in a room up to 10,000 ft³, it adds that S12.60 also asks that such rooms be adaptable to 0.3 s for students with hearing loss. Incomplete and Blocked results get no sentence.

The result page also shows the speech margin at the seat (empty room, best case) and a limitations box. Without a microphone, a user can run simulated sample rooms, four demo buttons for the safety rules (three "safety-rule demos" plus "Browser filtering on"), published data from university rooms, or a WAV upload.

## 4. How it works

1. **Capture:** `getUserMedia` with echo cancellation, noise suppression and auto gain control requested off; raw samples through an AudioWorklet (ScriptProcessor fallback); one 45 s take. The page cues each clap with a countdown, 4 s apart, so each decay has more than twice a long classroom echo time and clean background after it.
2. **Read-back:** `track.getSettings()`. Processing reported on: red badge, verdict blocked. Processing state unknown: amber badge.
3. **Clap detection:** a 200 Hz high-pass filter and a 5 ms energy envelope. A clap needs a 15 dB rise within the 100 ms before its peak.
4. **Bands:** third-order Butterworth octave filters at 500, 1000 and 2000 Hz.
5. **Decay per clap and band:** the background level before the clap; Lundeby-style truncation with noise subtraction; Schroeder backward integration (ISO 3382-2).
6. **Echo time:** T20 by linear regression from −5 to −25 dB; EDT from 0 to −10 dB.
7. **Quality gates:** 37 dB of clean decay or more: full confidence; 30–37 dB: lower confidence; under 30 dB: not used. Each band value is the median T20 of the usable claps among the first four detected.
8. **Trust checks in the audio:** clipping (red); the background drops after 2 or more claps, a noise-gate sign (red). Amber: clap spread over 10 %, a rising background, an implausibly high speech margin, a phone or tablet.
9. **Verdict:** the 3-band average against 0.6 s or 0.7 s (by room volume), with the ±15 % zone, the per-band guard, the one-way early-decay rule, and a tail guard: at lower confidence, if a slow late echo is still above the background after the noise cut-off, "Under" becomes "Too close to call" (added after an independent engine review on 15 November found a false pass on two-slope decays; a test now covers it). A room over 20,000 ft³ gets echo times but no verdict.
10. **Output:** verdict and next step, per-band echo times with the ±15 % zone drawn on the bar, trust badge, speech margin, report sentence, print and JSON download.

The engine is about 615 lines of dependency-free JavaScript (`engine/echo-engine.js`) with 27 automated tests. Run them with `node --test engine/test/engine.test.js`. To run the app locally, serve the repository root with any static web server and open `/app/` on `localhost` (the browser allows the microphone only on `localhost` or HTTPS).

### Repository map (this public copy)

| Folder | Contents |
|---|---|
| `app/` | The web page (`index.html`, `app.js`); `app/room/` is the 3D first screen (three.js in `app/vendor/`), `app/ui/` the scrolling and chalk details. No build step. |
| `engine/` | `echo-engine.js` (analysis, trust checks, verdict); `synth.js` (the simulated sample recordings); `cli.js` (checks a WAV file from the command line); `test/` (the 27 tests); `REFERENCE_VALUES.md` (every test result in this README, with method and caveats). |
| `recorder/` | A test page that records one take and saves it with the settings the browser reports. For device tests. |
| `version.txt` | Which commit of the team repository is live. |

This repository is the public hosting copy of the app, the engine and the recorder. The test harnesses (Python and Node) and the literature reviews are in the team's repository. Dataset audio is not published anywhere.

## 5. How we tested it

**Read this first:** in every dataset test below, a university measured the room's echo (ACE, MIT, HOMULA-RIR, PAN-AR) or a simulator computed it (pyroomacoustics). **We simulated the claps in every dataset test.** We simulated the background noise too, except in the ACE tests, which use each room's own recorded noise. The only real claps so far come from our own device test at home, on 1 device.

We always give two numbers: **false passes** and the **Incomplete rate** (no verdict). Zero false passes alone can hide a high no-verdict rate.

| Test (what is measured, what is simulated) | False passes | Incomplete (no verdict) | Median error when a verdict is given |
|---|---|---|---|
| **ACE Challenge corpus** (Eaton et al., IEEE/ACM TASLP 2016): 7 measured university rooms × 2 positions; simulated claps; each room's own noise | 0, at every clean-decay level tested | With 45 dB of clean decay: 2 of 14 (12 of 14 give a verdict). With 35 dB or less: almost all | 3.2 % |
| **Real app in headless Chrome:** a fake microphone plays 14 simulated takes (ACE rooms, simulated claps); processing off, then on | Off: 0 | Off: 2 of 14. On: all 14 Blocked by the browser's own report | Off: 3.2 %. On: processing moved T20 by up to −17.8 % |
| **MIT IR Survey** (Traer and McDermott, PNAS 2016): 102 measured indoor responses, including 35 classrooms; simulated claps and noise | 0 in both setups | Harsh setup: 35 of 102. Back-row-like setup: 2 of 102 | Harsh: 2.0 %. Back-row-like: 5.9 % |
| **Simulated classrooms** (pyroomacoustics, EPFL): 39 rooms × 3 seats × 3 clap levels × 35/45/50 dBA background; 1,053 takes per clap set | 2 per clap set before the Sunday tail guard, all at a seat 1.8 m from the clapper; **0 with the guard** (the app also asks for 3–5 m) | Forceful cupped clap (about 92 dB at 1 m, from the literature): a verdict at all 39 middle and all 39 back seats at 35 dBA, and at 37 of 39 back seats at 45 dBA. All takes: 77 of 1,053 (claps 86/92/98 dB); 444 of 1,053 (claps 74/80/86 dB) | About 1 % |
| **3 measured rooms:** 60 echo responses from HOMULA-RIR (Politecnico di Milano seminar room, 25 seats × 2 sources) and PAN-AR (University of Milan classroom and meeting room); simulated claps and HVAC-like noise at 35/45/50 dBA. **All 3 rooms are over the limit**, so this test cannot show how the check handles rooms that pass | 0 | 92 dB clap: a verdict for 46 of 50 seat responses at 35 dBA, but only 12 of 50 at 45 dBA (9 of 10 in row 1, 3 of 10 in row 2, none farther back). All test files: 269 of 540 (claps 86/92/98 dB) | About 1 % |

**Checks of the maths and of the real take:**

- 27 of 27 automated tests pass on synthetic decays with known answers (re-run 2026-11-15).
- pyrato (pyfar), an independent open-source implementation, on our real home take: 3-band average 0.412 s (ours) vs 0.398 s (pyrato), a 3.5 % difference; single bands differ by up to 8.6 %.
- The same home test with the browser's processing on gave "Blocked".
- The 28 headless-Chrome runs on the live HTTPS site gave verdicts identical to the local run.

**Not tested yet:** real laptop and phone microphones beyond one device, operating-system processing (Windows, macOS, ChromeOS), occupied rooms, and the real loudness of a clap in a real classroom (our clap level is an assumption).

## 6. Limitations

- **Real claps:** one home test on 1 device. No real classroom take yet. The clap level (about 92 dB at 1 m) comes from the literature (de Vos, Papadakis and Stavroulakis 2020), not from our measurement.
- **Devices and browsers:** real microphones beyond that 1 device are untested. Our browser tests used Chrome.
- **Operating-system processing:** the page cannot see it (for example Windows Voice Clarity). The page lists the settings and relies on the user to turn them off.
- **Rooms under the limit:** only the ACE and MIT tests contain them. All 3 HOMULA-RIR and PAN-AR rooms are over the limit.
- **Two-slope decays:** an engine review found that a fast early decay followed by a slow late one can make T20 read short at lower confidence. The tail guard removed the 2 simulated false passes per clap set, but in the reviewer's harder test grid it fixed 8 of 17 (9 extreme cases still pass), so "Under" stays "weak evidence".
- **Seat distance:** the simulated false passes (2 per clap set, before the tail guard) all came from a seat 1.8 m from the clapper; with the guard, 0 in both sets. The page asks for 3–5 m, but it cannot measure the distance.
- **No answer is common in hard conditions:** far from the clapper or with the ventilation running, the result is often "Incomplete" (HOMULA-RIR: 12 of 50 seat responses gave a verdict at 45 dBA). Incomplete is safe, but it gives no answer.
- **One seat, empty room:** the AAA guideline uses five positions. Occupied rooms are untested.
- **Not measured:** background noise against the 35 dBA limit (a laptop microphone is not calibrated), and noise is often the bigger problem. The check compares with the 0.6 s or 0.7 s limit, not the stricter 0.3 s provision for students with hearing loss.
- **Edition:** the page uses S12.60-2010 Part 1. A 2026 edition is listed; we do not know its content.
- **What a result means:** "Under the limit" is weak evidence and must never be used to deny accommodations. The check is not a hearing test, not a clinical assessment and not a compliance measurement.

### What's next

- Tests on more real devices (Chromebooks, phones) and in real classrooms, with the recorder page.
- A test with Windows Voice Clarity on and off on the team's machine (planned, not done).
- A one-page printable room report built around the report sentence, reviewed by educational audiologists.
- A noise check with a calibrated external microphone.

## 7. Feasibility

- **It runs today, for free:** a static web page (GitHub Pages) in Chrome on a laptop. No install, no account, no server, no running cost. Audio is analysed in the browser and never uploaded.
- **Who can use it tomorrow:** an educational audiologist or a teacher with a laptop and the room's rough size. One check takes about 2 minutes.
- **What it needs before wider use:** tests on more real devices (Chromebooks, phones), real classroom takes compared with a professional measurement, and a pilot with educational audiologists, who already have a reverberation step in the AAA 2011 room check.
- **What it will not become:** a compliance measurement. It stays a screening estimate that points to a proper measurement.

## 8. Credits and disclosures

### Experts consulted

Quotes are word for word, with permission. Advice is not an endorsement.

- **Peggy Nelson**, professor of audiology and member of the S12.60 standards committee (Professor Nelson served on the Acoustical Society of America's Task Force on Classroom Acoustics): *"A good method of estimating reverberation."* On our ±15 % "too close to call" band for claps recorded on a laptop: *"That error band sounds good."*
- **Erin C. Schafer, Ph.D., CCC-A**, Department Chair, Audiology & Speech-Language Pathology, University of North Texas: *"If I were still a practicing educational audiologist, I would use this screening check to evaluate a classroom's acoustics as part of an assistive technology evaluation for a student (to determine whether they need hearing technology in the classroom)."* On what such a report needs: *"They would just include a simple sentence stating whether or not the classroom met recommended levels."* The report sentence on the result page comes from this answer.
- **Threshold Acoustics** (architectural acoustics firm): a principal told us that the check helps if it sends people toward a measurement and never replaces one, and that a false pass is the harm. (Advice, not an endorsement.)

- **Architectural-acoustics graduate students** at a US university reviewed the method and the live app on 15 November 2026. They saw no glaring issues in the method. Their suggestions (a countdown for each clap, 4 s between claps, countdown-based instructions, plainer words) are built in.

Other experts gave advice that shaped the design. They are not named.

### Datasets and licences

No dataset audio is redistributed. The repository publishes numbers only.

| Name | Source | Licence | Used for |
|---|---|---|---|
| ACE Challenge corpus | Eaton, Gaubitch, Moore and Naylor, IEEE/ACM TASLP 24(10), 2016; Zenodo 6257551 | Conflict: CC BY 4.0 (Zenodo) vs CC BY-ND 4.0 (Imperial page); we follow the stricter one | Accuracy tests; published values in the sample rooms |
| MIT IR Survey | Traer and McDermott, PNAS 2016 | No licence stated; audio kept private | Accuracy tests |
| HOMULA-RIR | Miotello et al., ICASSP 2024 (HSCMA workshop), Politecnico di Milano; Zenodo 10479726 | CC BY 4.0 | Accuracy tests |
| PAN-AR | Denti, Fantini, Avanzini, Presti, Audio Mostly 2024, University of Milan (LIM) | Conflict: CC BY-NC-SA 4.0 (files) vs CC BY-SA 4.0 (Zenodo); non-commercial use only | Accuracy tests |
| pyrato / pyfar | pyfar.org | MIT | Reference T20 in tests (not shipped) |
| pyroomacoustics | Scheibler et al., ICASSP 2018; EPFL LCAV | MIT | Simulated classrooms in tests (not shipped) |

Papers and standards behind the rules: ANSI/ASA S12.60-2010 Part 1 (text not reproduced); ISO 3382-2; JCGM 106:2012; Hak, Wenmaekers and van Luxemburg 2012; Papadakis and Stavroulakis 2020; de Vos, Papadakis and Stavroulakis 2020; AAA HAT guideline Supplement B (2011). Full list with links: the team research notes.

### Built with

JavaScript. The measuring engine uses no libraries; the 3D first screen uses three.js (MIT) with the meshoptimizer decoder (MIT), smooth scrolling uses Lenis (MIT), and the typeface is Archivo (SIL Open Font License 1.1), Web Audio API (AudioWorklet), getUserMedia, GitHub Pages. Testing only: Node.js, Python, NumPy, SciPy, pyrato and pyfar, pyroomacoustics, headless Google Chrome.

### Team

William and Kartikeya.

### AI assistance

Claude Code sessions (Anthropic) wrote most of the code and most of the text in this repository, under the team's direction. The team made the decisions, ran the device test and did the expert outreach. The test numbers in this README come from `engine/REFERENCE_VALUES.md`.

### Licence

No licence file yet.
