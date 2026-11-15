# Reference values for the engine

Written by the Partner session, Friday 2026-11-13, about 21:10 CST. README Phase 1 rows 4 and 5.

## 1. Engine against synthetic decays (CI test)

`node --test engine/test/engine.test.js`: **27 of 27 pass** (re-run Sun 2026-11-15 13:35 CST; 16 on Friday, 22 after the Saturday additions, 27 after the Sunday engine review, §12). Pass rule: every band T20 within 0.05 s or 5 % of the true T60, whichever is larger.

| What is tested | Result |
|---|---|
| T60 = 0.3, 0.45, 0.6, 0.9, 1.2 s, 4 claps, background −70 dBFS, 48 kHz | 4 claps found within 20 ms; all bands and the 3-band average within tolerance |
| Different T60 per band (0.8 / 0.6 / 0.45 s) | Each band within tolerance |
| 44.1 kHz | Within tolerance |
| Background −33 dBFS (under 30 dB of clean decay) | "Incomplete" |
| Clipped claps | "Blocked", reason "clipped" |
| Gain drop after each clap (AGC or adaptive suppression) | "Blocked", reason "noise-suppression signature" |
| Browser reports `noiseSuppression: true` | "Blocked", red badge |
| Octave filters | 0 dB at the centre, −3.01 dB at the band edges, below −30 dB two octaves away |

## 2. Engine against the Python reference and pyrato

| Comparison | Data | Result |
|---|---|---|
| JS engine vs `tools/analyze_device_test.py` | Friday's 2 device-test takes (27 clap-band pairs) | **Identical** to 3 decimals (T20, clean decay, floor residual) |
| Python vs pyrato 1.1.0 (`energy_decay_curve_lundeby` + `reverberation_time_linear_regression`, same claps and band filters) | Synthetic T60 0.3 / 0.6 / 0.9 / 1.2 s | Band medians within 2 % of each other and of the true value. Per-clap difference: median 0–1 %, max 5.2 % |
| Same | Friday pass 1 (processing off), real room | 3-band average: **0.412 s ours, 0.398 s pyrato (3.5 %)**. 500 Hz differs most (0.378 vs 0.348 s). Per-clap max 11 % |
| Same | Friday pass 2 (processing on) | pyrato failed on 3 of 12 clap-bands ("Regression failed ... check the SNR"): the suppressed tail is near digital silence. Our engine gave values; the verdict is "Blocked" anyway |

**Reading:** the method matches an established open-source implementation on clean decays. On a real clap the two Lundeby variants differ by a few percent. That is inside the ±15 % "Too close to call" band.

## 3. ACE Challenge corpus (real rooms, ground truth)

**Source:** Eaton, Gaubitch, Moore, Naylor, "Estimation of Room Acoustic Parameters: The ACE Challenge", IEEE/ACM TASLP 24(10), 1681–1693, 2016, doi:10.1109/TASLP.2016.2577502. Dataset: Zenodo record 6257551, doi:10.5281/zenodo.6257551. Values from `Data/20150225T195903_test_t60_DRR_measurement_results.csv` in `ACE_Corpus_Data.tbz2` (Crucif array, channel mean). Dimensions: arXiv 1606.03365, Table 1.

**License conflict:** Zenodo says CC BY 4.0. The Imperial College page says CC BY-ND 4.0. Use the Zenodo copy, give attribution, and **do not publish modified (trimmed or filtered) ACE audio** until this is resolved. Quoting the published numbers with attribution is fine.

| Room | Volume (derived) | S12.60 limit | 3-band T20 mean, two mic positions | Our verdict rule would give |
|---|---|---|---|---|
| Meeting_Room_1 | 99.6 m³ = 3,519 ft³ | 0.6 s | 0.41 / 0.42 s | Under the limit (weak evidence) |
| Meeting_Room_2 | 245.7 m³ = 8,677 ft³ | 0.6 s | 0.43 / 0.40 s | Under the limit (weak evidence) |
| Lecture_Room_1 | 202.3 m³ = 7,144 ft³ | 0.6 s | 0.59 / 0.67 s | **Too close to call** (both positions) |
| Lecture_Room_2 | 371.5 m³ = 13,118 ft³ | 0.7 s | 1.67 / 1.69 s | Likely over the limit |

**Caveats:**
- ACE gives 1/3-octave bands (501, 1000, 1995 Hz), not octave bands. The "3-band mean" is the mean of three 1/3-octave T20 values.
- The values come from measured impulse responses, not claps. Clap results will scatter more.
- These are university rooms, not K-12 classrooms.
- The two microphone positions in Lecture_Room_1 differ by 0.08 s. Position matters; this is why "Too close to call" exists.
- ACE also has a 2-channel "Chromebook" microphone configuration (at 0.68 m height). Its RIRs could show how a laptop-height microphone sees the same rooms. The smallest RIR download is 417 MB (single channel, all rooms). Not downloaded.
- Unknown: the excitation signal, the RIR bit depth (sources conflict), whether each session was occupied.

**Demo use:** the four rooms give one example of each verdict except "Blocked" and "Incomplete". A "Try a sample classroom" button can use these published numbers with attribution, without shipping ACE audio.

## 4. Accuracy table v1: real rooms (ACE impulse responses), Friday 21:30 CST

**What was run:** `tools/ace_accuracy.py` on the ACE "Single" impulse responses (7 rooms × 2 microphone positions, 48 kHz). The 417 MB archive was downloaded from Zenodo with the team's approval and its MD5 matched. **ACE audio is kept in `private/` and is never committed.** Ground truth is ACE "T20 ISO", cruciform channel 1 (the same microphone as "Single"). ACE gives 1/3-octave bands, so the truth is the mean of the 501, 1000 and 1995 Hz values.

- **"Ours on RIR"** means our octave-band analysis of the measured impulse response itself.
- **"Ours, 4 claps"** means the full pipeline:
  - 4 synthetic claps (2 ms noise bursts, ±2 dB level spread) convolved with the room's impulse response;
  - the room's own recorded ambient noise, scaled so that the 1 kHz decay is about the given INR;
  - then clap detection, the clean-decay gate and medians.
- The other bands get less clean decay when the room noise has more low-frequency energy.

| Room | Pos | ft3 | ACE T20 (1/3-oct centres) | ACE (octave approx) | Ours on RIR | Ours, 4 claps, INR 45 | Ours, 4 claps, INR 35 | Verdict ACE | Verdict ours (45 / 35) |
|---|---|---|---|---|---|---|---|---|---|
| Lecture_Room_2 | 79 | 13,118 | 1.67 | 1.63 | 1.62 (-3 %) | 1.64 (-2 %) | — | Likely over | Likely over / Incomplete |
| Lecture_Room_2 | 84 | 13,118 | 1.68 | 1.62 | 1.64 (-3 %) | 1.66 (-1 %) | — | Likely over | Likely over / Incomplete |
| Office_1 | 41 | 1,671 | 0.35 | 0.36 | 0.36 (+3 %) | 0.36 (+3 %) | — | Under | Under / Incomplete |
| Office_1 | 47 | 1,671 | 0.38 | 0.38 | 0.38 (-1 %) | 0.38 (-1 %) | — | Under | Under / Incomplete |
| Meeting_Room_1 | 62 | 3,519 | 0.43 | 0.43 | 0.42 (-1 %) | 0.43 (+0 %) | — | Under | Under / Incomplete |
| Meeting_Room_1 | 67 | 3,519 | 0.41 | 0.42 | 0.42 (+3 %) | 0.42 (+3 %) | — | Under | Under / Incomplete |
| Lecture_Room_1 | 97 | 7,144 | 0.58 | 0.60 | 0.68 (+19 %) | — | — | Too close | Incomplete / Incomplete |
| Lecture_Room_1 | 101 | 7,144 | 0.67 | 0.68 | 0.73 (+8 %) | 0.71 (+6 %) | — | Too close | Likely over / Incomplete |
| Meeting_Room_2 | 25 | 8,677 | 0.44 | 0.42 | 0.42 (-6 %) | — | — | Under | Incomplete / Incomplete |
| Meeting_Room_2 | 33 | 8,677 | 0.40 | 0.41 | 0.42 (+5 %) | 0.43 (+5 %) | — | Under | Under / Incomplete |
| Office_2 | 9 | 1,705 | 0.49 | 0.48 | 0.47 (-3 %) | 0.47 (-3 %) | — | Under | Under / Incomplete |
| Office_2 | 17 | 1,705 | 0.45 | 0.47 | 0.46 (+1 %) | 0.46 (+1 %) | — | Under | Under / Incomplete |
| Building_Lobby | 115 | 2,575 | 0.95 | 0.99 | 0.97 (+3 %) | 0.89 (-5 %) | — | Likely over | Likely over / Incomplete |
| Building_Lobby | 125 | 2,575 | 0.94 | 0.90 | 0.92 (-2 %) | 0.90 (-5 %) | 0.82 (-13 %) | Likely over | Likely over / Likely over |

**Sweep over clean-decay levels (same 14 measurements):**

| Set INR at 1 kHz | Results given | Median error | Max error | Verdict agrees with ACE | **False passes** |
|---|---|---|---|---|---|
| 30 dB | 0 of 14 (all Incomplete) | — | — | — | **0** |
| 35 dB | 1 of 14 | 12.9 % | 12.9 % | 1 of 1 | **0** |
| 40 dB | 4 of 14 | 5.0 % | 9.7 % | 4 of 4 | **0** |
| 45 dB | 12 of 14 | 3.2 % | 5.9 % | 11 of 12 | **0** |
| 50 dB | 14 of 14 | 3.2 % | 13.4 % | 13 of 14 | **0** |
| Impulse response directly | 14 of 14 | 2.7 % | 18.5 % | — | — |

**Reading:**
- **No false pass at any level.** The engine never said "Under the limit" for a room ACE measured as over or close to it. With too little clean decay it says "Incomplete" instead of guessing.
- When it gives a result with enough clean decay, the median error is 3–5 %. That is well inside the ±15 % "Too close to call" band.
- **The one verdict disagreement is harmless:** Lecture Room 1, position 2 reads "Likely over" against ACE's "Too close to call". Both lead to the same next step (ask for a proper measurement).
- **Largest error:** Lecture Room 1, position 1 reads +17–19 % (0.68 s against 0.58 s). ACE's own octave-approximate value is 0.60 s. Reason not yet known: a double-slope decay or the band definition (UNVERIFIED).
- **Limits of this test:**
  - The microphone is ACE's measurement microphone, not a laptop.
  - The claps are synthetic bursts, not hands.
  - These are university rooms.
  - Real laptop takes are still needed (device matrix).

**Engine changes from this and from `research/CLAP_ACCURACY.md`:**
1. **Full confidence now needs 37 dB of clean decay** (was 35). Hak et al. 2012: 37 dB keeps T20 within 5 %; ISO 3382-2 asks for 35. From 30 to 37 dB the result is "lower confidence" (the audiology professor said 30 dB may be enough). Below 30 dB it is Incomplete.
2. **A band over the limit never lets the result read "Under".** The verdict still uses the 3-band average (expert advice), but the S12.60 text may apply the limit per band. If the average is under and any band is over, the result is "Too close to call", with the reason given.
3. **The page names "ANSI/ASA S12.60-2010 Part 1"**, because a 2026 edition is now listed and its content is unknown.
4. **±15 % "Too close to call" stays.** For one position, the research finds it defensible: the ISO random-error part alone is ±5–7 % at 2σ, and published clap and phone errors are 10–33 %.

## 5. Browser "device" test: the real app in headless Chrome with a fake microphone (Friday 22:50 CST)

**What was run:** `tools/browser_device_test.mjs`. It launches a separate headless Chrome 157 (own temporary profile) with `--use-file-for-fake-audio-capture`, so the microphone "hears" a 46 s take. The takes come from `tools/make_fake_mic_takes.py`: ACE room responses, 4 claps, the room's own ambient noise, and speech-like sound at 30–41 s. The app runs in its automatic test mode (`?autotest`). Every one of the 14 takes ran twice: processing requested off, and processing on (Chrome's real echo cancellation, noise suppression and gain control).

**What this tests:** the real browser path (getUserMedia constraints, AudioWorklet capture at 48 kHz, the 45 s protocol, the in-browser engine) and Chrome's real processing. **What it does not test:** microphone hardware, operating-system processing (Windows, macOS, ChromeOS noise cancellation), laptop fan noise and desk reflections. **It does not replace a real laptop test.**

| Result | Processing off | Processing on |
|---|---|---|
| Runs completed | 14 of 14 | 14 of 14 |
| Verdicts given | 11 of 14 (3 Incomplete) | 0 (all Blocked) |
| Error against ACE (3-band T20) | median 3.2 %, max 16.4 % (Lecture Room 1, position 1) | — |
| False passes | **0** | — |
| T20 change caused by processing | — | median −4.5 %, range −17.8 % to +5.7 % |
| Caught by the browser's own report (`getSettings`) | — | **14 of 14 (red)** |
| Caught by our audio-only checks (floor drop, speech margin over 55 dB) | — | **0 of 14** |
| Speech margin (median) | 30.5 dB | 45.5 dB (filtering inflates it by about 15 dB) |

**Reading:**
- The app works end to end in a real browser. Capture is AudioWorklet at 48 kHz, 45 s.
- **Chrome's processing can move the echo time by up to 18 %.** Blocking the verdict when the browser reports processing is therefore necessary.
- **The trust badge depends on the browser's own report.** In these takes the audio-only checks caught nothing. Processing that the browser does not report (operating-system effects) would not be caught. The README and the page must not claim more.
- **The "decay bends" warning fired on 11 of 14 clean takes.** It is now an information note that does not change the badge. The "noise changed after the clap" warning fired on 6 of 14, because real ambient noise is not steady; it stays as amber.

**Rerun on the live HTTPS site (Saturday 11:20 CST):** the same 28 runs against https://kniggukniggu-droid.github.io/echo-check/app/ (GitHub Pages, real HTTPS instead of localhost). **All 28 verdicts are identical to Friday's local run** (14 off: same verdicts; 14 on: all Blocked). The hosted page loads the engine, gets the microphone and runs the full protocol.

## 6. Home rooms and classrooms: the MIT IR Survey (Friday 22:40 CST)

**What was run:** `tools/mit_ir_test.py` on the 103 indoor impulse responses of the MIT IR Survey (Traer & McDermott, "Statistics of natural reverberation enable perceptual separation of sound and space", PNAS 2016; 32 kHz). The rooms are classrooms, bedrooms, bathrooms, kitchens, living and dining rooms, offices, hallways and gyms.
- **Reference:** pyrato 1.1.0 (Lundeby EDC + T20 regression) on the impulse response itself, same octave filters.
- **Ours:** the full pipeline on 4 synthetic claps in that room with white background noise (1 kHz clean decay about 45 dB).
- **Verdicts:** use the 0.6 s limit.
- The survey page states no license, so the audio stays in `private/` and only these numbers are published.

| Group | Rooms with a result | Reference T20 range | Median error | Max error | Verdict agrees | **False passes** |
|---|---|---|---|---|---|---|
| Classrooms | 13 | 0.33–1.17 s | 0.9 % | 4.3 % | 13 of 13 | **0** |
| Homes (bedroom, bathroom, kitchen, living, dining, shower) | 27 | 0.20–0.89 s | 1.7 % | 11.0 % | 27 of 27 | **0** |
| Offices | 6 | 0.18–0.50 s | 3.0 % | 9.6 % | 6 of 6 | **0** |
| Hallways and stairwells | 9 | 0.22–2.07 s | 4.1 % | 10.8 % | 9 of 9 | **0** |
| Gyms | 2 | 0.33–0.99 s | 5.1 % | 5.9 % | 2 of 2 | **0** |
| **All** | **57 of 103** | | **2.0 %** (90th percentile 7.3 %) | 11.0 % | **57 of 57** | **0** |

**Incomplete rate, stated next to the false passes:** 46 of 103 rooms (45 %) got no verdict, including **22 of 35 classrooms**. The false-pass result above comes partly from the engine giving no answer.

**Second setup, closer to the real protocol (Saturday 00:20 CST, `MIT_NORM=reverb`):** the background is set 45 dB below the room's own echo (the level 20 ms after the clap), not below the direct-sound peak.

| Setup | Incomplete | Classrooms with a verdict | Median error | 90th percentile | False passes | Verdict disagreements |
|---|---|---|---|---|---|---|
| Background 45 dB under the direct-sound peak (harsh) | 46 of 103 | 13 of 35 | 2.0 % | 7.3 % | **0** | 0 of 57 |
| Background 45 dB under the room echo (back-row-like) | **0 of 103** | **35 of 35** | 5.8 % (4.8 % for rooms ≥ 0.25 s) | 30.6 % | **0** | 13 of 102, **all in the safe direction** (8 Under → Too close, 5 Too close → Likely over) |

- **Why the first setup is harsh:** MIT used a loudspeaker 1.5 m from the microphone. In the living room traced in detail (`h004`), the 2000 Hz direct sound is 26 dB above the room's echo. A background 39 dB under the peak therefore leaves only about 15 dB of echo decay, and T20 needs 25–35 dB, so "Incomplete" was the correct answer. At a back-row desk with claps at the front, the direct sound is much weaker. Friday's real home take gave 50–60 dB of clean decay in every band.
- **Errors in the second setup are mostly over-estimates** (mean +12.8 %), so the engine errs toward "ask for a measurement", never toward a false pass.
- **The largest errors are in very short MIT files** (0.29–0.46 s long, shorter than the room's echo), where the reference value from the file itself is unreliable. For example, pyrato gives 0.01–0.02 s at 2000 Hz in two of them.
- **Open:** real laptop microphones may land between the two setups. The page now explains a loud-but-short Incomplete: "clap from the front, not near the device".

**Reading (first setup):**
- **When the engine gives a result, it agrees with the reference method: 57 of 57 verdicts, no false passes, median error 2 %.**
- **46 rooms were "Incomplete"** (35 of them for the 2000 Hz band only), and the reason is known. The survey placed the microphone 1.5 m from the source, so the direct sound is strong. The "clean decay" figure (peak minus background) then looks large, while the room's own decay is too close to the background for T20. Giving no result is the safe and correct outcome.
- A later-decay fit was tried to recover these rooms. It did not recover them and raised the max error from 11 % to 20 %, so it was reverted.
- **In the real protocol** (claps at the front, device at the back row), the direct sound is weaker, so this matters less. Improvement idea for Saturday: measure the usable decay range from the decay curve itself, not from the peak.

## 7. Simulated classrooms: the app's own geometry (pyroomacoustics, EPFL; Saturday 11:25 CST)

**What was run:** `tools/pra_classroom_sim.py` builds 39 empty shoebox classrooms in pyroomacoustics 0.10.1 (EPFL LCAV; hybrid image-source order 3 + ray tracing, octave-band materials from its database, air absorption, scattering 0.15):
- 3 sizes: 30×24×9 ft (6,474 ft³), 30×30×10 ft (8,998 ft³), 40×32×11 ft (14,061 ft³, limit 0.7 s).
- 6 real finishes, from bare (plaster ceiling, block walls, vinyl) to ceiling tile + carpet + a back-wall panel, plus 7 uniform-absorption rooms.
- A person claps 1.5 m from the front wall at 1.4 m height. The device lies on a desk (0.76 m) at a **front** (1.8 m from the clapper), **middle** or **back** seat (6–9 m).

**The clap:** the octave-band shape of the team's own Friday claps (equal energy per octave from 500 Hz to 8 kHz within 1.5 dB), at **74 / 80 / 86 dB** (10 ms broadband level at 1 m: "soft / normal / loud"). **The absolute clap level is an ASSUMPTION** (Papadakis & Stavroulakis 2020 report a mean of 76–85 dB at about 60 cm, metric not stated). **The background:** HVAC-like noise (falling 5 dB per octave) at **35 dBA (the S12.60 limit), 45 and 50 dBA**. 1,053 takes in total. **Every take is scored by the real JS engine** (`tools/batch_assess.mjs`). The reference is pyrato T20 (Schroeder; the simulated responses are noise-free) on the same impulse response.

| Seat | Clap | 35 dBA background: no verdict / median error | 45 dBA | 50 dBA |
|---|---|---|---|---|
| Front (1.8 m) | soft / normal / loud | 10 / 0 / 0 of 39 · 2.1 / 0.7 / 0.8 % | 39 / 39 / 3 of 39 | 39 / 39 / 38 of 39 |
| Middle | soft / normal / loud | 36 / 9 / 6 of 39 · 1.1 / 1.4 / 0.8 % | 39 / 39 / 23 of 39 | all 39 |
| Back (6–9 m) | soft / normal / loud | 37 / 21 / 17 of 39 · 1.1 / 1.1 / 1.2 % | 39 / 39 / 31 of 39 | all 39 |

- **Verdicts given: 276 of 1,053 takes (26 %). Median error when a verdict is given: about 1 % (90th percentile ≤ 5.7 %).**
- **False passes: 2 of 276 verdicts.** Both are at the **front seat, 1.8 m from the clapper**, in the same room (30×30×10 ft, ceiling tile + carpet + back-wall panel). The reference is 0.66 s with a bent 500 Hz decay (0.84 / 0.59 / 0.54 s per band). The engine read 0.45 and 0.43 s. A slow late decay sat below the background, so the engine could not see it. **The protocol must keep the device away from the clapper** (see the setup change below). Verdict disagreements: 8 of 276; 4 stricter than the reference, 4 less strict (including the 2 false passes).
- **No verdict ("Incomplete") is the main outcome** at the back seat and at 45 dBA or more. **Cause: the claps do not rise far enough above the background** (median clean decay 34 dB at the back seat with the normal clap at 35 dBA; the gate needs 30 dB per clap, 2 claps per band). In 15 of the 21 back-seat Incompletes (normal clap, 35 dBA), the engine found no claps at all.
- **Calibration check against reality:** Friday's real claps (home room, USB headset) gave **50–60 dB** of clean decay; the simulated normal clap gives 34–39 dB at 35 dBA. The real background in a home at night, or the distance, may explain the gap. **The background level in a real classroom during a test is the deciding unknown** (literature review in `research/CLASSROOM_FIELD_DATA.md`).

**Calculator vs measurement (scattering check, `--scatter`, 30×30×10 ft room, back seat):**

| Finish | Sabine (500–2k avg) | Measured T20 at scattering 0.15 / 0.30 / 0.50 / 0.70 / 0.90 |
|---|---|---|
| Ceiling tile only (vinyl, block walls) | 0.64 s | 1.04 / 0.63 / 0.57 / 0.50 / 0.48 s |
| Ceiling tile + carpet | 0.35 s | 0.82 / 0.50 / 0.39 / 0.41 / 0.32 s |

**Reading:** in an empty room with little scattering, a room with all its absorption on the ceiling can measure much longer than a Sabine calculator predicts (sound keeps bouncing between hard walls). With furniture-like scattering (0.3–0.5), the calculator and the measurement roughly agree. **Do not claim that calculators are wrong**; say that the result depends on the furniture and the layout, which a measurement includes and a formula does not.

## 8. Simulated claps in 3 measured rooms (HOMULA-RIR and PAN-AR; Saturday 11:30 CST)

**Scope (corrected 12:35):** the real part is **60 measured impulse responses from 3 rooms** (loudspeaker measurements by two universities). The claps and the background noise are **our simulation**, added at 9 loudness settings (540 test files per run). Nobody clapped in these rooms. **All 3 rooms are over the limit**, so this section cannot show how the engine handles rooms that pass (§4 ACE and §6 MIT cover under-limit rooms).

**What was run:** `tools/real_classroom_test.py` on measured responses from two universities. The same clap and background model as §7; each response is scaled so its direct sound matches a point source at the stated distance (checked on simulated responses: within about 2 dB). **Loudspeakers are directional, so this is harsher than a hand clap** (stronger direct sound).
- **HOMULA-RIR** (Politecnico di Milano, 2024; Zenodo 10479726, **CC BY 4.0**, MD5 matched): a furnished seminar room used for lessons, 268 m³ (9,464 ft³, limit 0.6 s). 2 loudspeakers at the front, **25 seats in 5 rows, 3.5 to 9.7 m from the front**. 50 responses.
- **PAN-AR** (University of Milan, LIM, 2024; sofacoustics.org): a classroom (472 m³, limit 0.7 s) and a meeting room (87.8 m³, limit 0.6 s), 5 source positions each. **Licence conflict: the files say CC BY-NC-SA 4.0, Zenodo says CC BY-SA 4.0.** Non-commercial use only.
- Reference: pyrato (Lundeby + T20) on each measured response. Audio stays in `private/`.

| Room | Reference T20 (3-band) | Takes | Verdicts given (35 dBA: soft / normal / loud) | Verdict agrees | Median error | **False passes** |
|---|---|---|---|---|---|---|
| HOMULA seminar room | 0.68–0.78 s (over 0.6) | 450 | 0 / 8 / 23 of 50 | 27 of 31 (3 said "too close" where the reference says "over"; 1 was stricter than the reference) | 1.0–4.3 % | **0** |
| PAN-AR classroom | 1.04–1.09 s (over 0.7) | 45 | 0 / 2 / 4 of 5 | 6 of 6 | 1.8–1.9 % | **0** |
| PAN-AR meeting room | 1.16–1.22 s (over 0.6) | 45 | 4 / 5 / 5 of 5 (loud clap at 45 dBA: 5 of 5) | 21 of 21 | 0.6–2.7 % | **0** |

**HOMULA by row (normal clap, 35 dBA): row 1 (3.5 m) 7 of 10 verdicts; row 2 (5.0 m) 1 of 10; rows 3–5 (6.5–9.7 m) 0 of 10.** At 45 dBA: no verdicts in HOMULA or the PAN-AR classroom.

**Reading:**
- **0 false passes in 540 test files (simulated claps in 60 measured responses from 3 over-limit rooms). When a verdict is given, it is accurate (median error 0.6–4.3 %).**
- **All three rooms are over the limit,** so this test shows that the engine does not pass an over-limit room. It cannot check under-limit rooms (§4 and §6 do).
- **Distance matters most:** a seat 3.5 m from the clapper gives a verdict in most takes; seats 6.5 m or more away rarely do, with our assumed clap level.

**What changed in the product because of §7 and §8 (Saturday 11:35):**
1. The setup step now says: close the door and windows, switch off fans and the projector, and switch off loud ventilation if allowed; a quiet room is the most important condition.
2. "Incomplete" now says *why*: "No claps were heard clearly above the background noise" or "The claps were too quiet above the background at this seat (best N dB, need 30 dB)", with what to do (quieter room, cupped claps, a seat about 3–5 m from the clapper). New test; 21 of 21 tests pass.
3. **Open decision (team):** the device position. Today's evidence says 3–5 m from the clapper, not the far back row and not the front row. The README protocol says "back-row desk".

## 9. Early-decay rescue: "Likely over" from quiet claps (Saturday 11:45 CST)

**Problem (§7–§8):** most "Incomplete" results come from claps that are too quiet for T20 (it needs 30 dB of clean decay per clap). Most of these rooms are over the limit: 1,103 of 1,259 Incomplete takes in §7–§8.

**Rule (in `engine/echo-engine.js`, `DEFAULTS.edtRescue`):** when T20 is Incomplete, the engine uses the early decay time (EDT, 0 to −10 dB of the decay curve), which needs much less clean decay. It says **"Likely over the limit", lower confidence**, only if all of these hold:
- each band has at least 2 claps with at least 20 dB of clean decay;
- the 3-band EDT average is at least **1.3 × the limit**;
- every band's EDT is at or above the limit;
- the room size is known, the room is 20,000 ft³ or less, and the trust badge is not red.

**It can never pass a room.** EDT read 4.9 % shorter than T20 (median; 10th–90th percentile −24 % to +9 %) in 437 takes that had enough decay for both, so it errs toward "under". A wrong rescue could at worst turn "Too close to call" into "Likely over"; both give the same next step (ask for a proper measurement).

**Validation with the real JS engine on every dataset (before → after):**

| Dataset | No verdict | Rescued by EDT | Rescued rooms that are really over the limit | Rescued rooms that are close or under | False passes | Other verdicts changed |
|---|---|---|---|---|---|---|
| Simulated classrooms (§7) | 777 → 566 of 1,053 | 211 | 211 | **0** | 2 → 2 | 0 |
| Simulated claps in 3 measured rooms (§8) | 482 → 455 of 540 | 27 | 27 | **0** | 0 → 0 | 0 |
| ACE browser takes (§5, processing off) | 3 → 2 of 14 | 1 (Lecture Room 2, 1.67 s) | 1 | **0** | 0 | 0 |
| MIT harsh setup (§6), now run through the JS engine | 45 → 35 of 102 | 10 | 10 | **0** | 0 | 0 |
| MIT back-row-like setup (§6) | 2 of 102 | 0 | — | — | 0 | 0 |

**Total: 249 rescues, all in rooms that are over the limit; 0 in rooms that are close to or under the limit; no other verdict changed.** Synthetic tests: quiet claps at T60 1.2 s → "Likely over" (EDT within 5 % of the true value); at 0.4 and 0.6 s → still Incomplete. 22 of 22 tests pass.

**MIT through the JS engine (new; Friday used the Python mirror):** harsh setup 57 verdicts, median error 2.0 %, 0 false passes; back-row-like setup 100 verdicts, median error 5.9 %, 0 false passes, 0 of 35 classrooms Incomplete. Close to Friday's Python mirror (harsh: 46 Incomplete before the rescue vs 45 here; median error 2.0 % in both).

**Limits:** EDT can read longer than T20 at some seats (strong late energy, coupled spaces). The 1.3× margin and the every-band check guard against that; in our data the largest EDT over-read was +9 % at the 90th percentile. The page shows the EDT values and says "lower confidence" and "can only say likely over, never under".

**Live-site check (Saturday 11:50, headless Chrome, https://kniggukniggu-droid.github.io/echo-check/app/, 3 ACE takes × processing off/on):** every result page finished rendering. Lecture Room 2 position 2 (ACE 1.67 s), processing off: "Likely over the limit" from EDT 1.50 s (before the rescue: Incomplete). An under-limit room stayed "Under the limit (weak evidence)". An Incomplete room with EDT 0.36 s stayed Incomplete. All processing-on runs: Blocked.

## 10. Realistic clap level and a clap-detector fix (Saturday 12:20 CST)

**Why:** the literature review (`research/LOW_INR_METHODS.md` §1) found that our "normal" clap of 80 dB was probably 12–16 dB too low. A forceful cupped clap is about 92–96 dB as a 10 ms level at 1 m (de Vos, Papadakis & Stavroulakis 2020, Table 2: 87.9–89.5 dB(A) at 0.6 m over 125 ms, converted). §7 and §8 were rerun with claps of **86 / 92 / 98 dB**, reusing the same simulated and measured responses.

**Bug found and fixed in the clap detector:** far from the clapper in an echoey room, the sound keeps building up for 30–50 ms after the direct sound, as reflections add up. The detector required a 15 dB rise within the 20 ms before the peak. It therefore missed loud, clear claps: 16 of 17 back-seat failures in the simulation, and one PAN-AR classroom position at every clap level. **Fix:** a 15 dB rise within the 100 ms before the peak (`detectClaps`). Friday's real takes are unchanged (same claps, same 0.41 s). 22 of 22 tests pass.

**Effect of the fix on every dataset (JS engine; before → after):**

| Dataset | Takes | No verdict | False passes | Early-decay rescues (any not truly over?) | Median T20 error (verdicts) | Existing verdicts that changed |
|---|---|---|---|---|---|---|
| Simulated classrooms, claps 74/80/86 dB | 1,053 | 566 → 444 | 2 → 2 | 276 (0) | 1.0 % (333) | 0 |
| Simulated classrooms, claps 86/92/98 dB | 1,053 | 275 → 77 | 2 → 2 | 124 (0) | 0.9 % (852) | 0 |
| Simulated claps in 3 measured rooms (HOMULA, PAN-AR), claps 74/80/86 dB | 540 | 455 → 447 | 0 → 0 | 29 (0) | 0.9 % (64) | 0 |
| Simulated claps in 3 measured rooms, claps 86/92/98 dB | 540 | 278 → 269 | 0 → 0 | 14 (0) | 1.0 % (257) | 0 |
| ACE takes (processing off) | 14 | 2 → 2 | 0 → 0 | 1 (0) | 3.2 % (11) | 0 |
| MIT harsh / back-row-like | 102 / 102 | 35 → 35 / 2 → 2 | 0 → 0 | 10 (0) / 0 | 2.0 % / 5.9 % | 0 |

**Current picture (fixed engine, realistic clap):**

| Where (verdicts, including early-decay "Likely over") | Clap | 35 dBA (ventilation off) | 45 dBA (ventilation on, typical) | 50 dBA |
|---|---|---|---|---|
| Simulated, middle seat | normal 92 dB / loud 98 dB | verdict in 39 / 39 of 39 | 39 / 39 | 35 / 39 |
| Simulated, back seat (6–9 m) | normal / loud | 39 / 39 | 37 / 39 | 30 / 36 |
| Measured seminar room HOMULA (25 seats × 2 sources; simulated claps), normal 92 dB | rows 1–3 (3.5–6.5 m) | 30 of 30 | 12 of 30 (row 1: 9 of 10; row 2: 3 of 10; row 3: 0) | — |
| | rows 4–5 (8–10 m) | 16 of 20 | 0 of 20 | — |
| Measured PAN-AR classroom (simulated claps), normal 92 dB | 5 positions | 5 of 5 | 5 of 5 | 5 of 5 (4 from the early decay) |

- **False passes: 0 in 1,080 test files built from 60 measured responses of 3 over-limit rooms (simulated claps and noise; §8 + §10). 2 in the simulated rooms, both at a seat 1.8 m from the clapper** (excluded by the 3–5 m setup advice). **None of the 3 measured rooms is under the limit.**
- **When a verdict is given, the median error is about 1 %** against pyrato on the same responses (90th percentile 2–7 %).
- **HOMULA is harsher than a real clap:** its loudspeakers are directional, so the direct sound is stronger relative to the echo.
- **Reading:** with a loud cupped clap and the ventilation paused, a verdict is likely from most seats. With the ventilation running (about 44 dBA in US rooms, `research/CLASSROOM_FIELD_DATA.md`), seats about 3–5 m from the clapper work best. **The clap level is still literature-based, not measured by us;** a real classroom take is the remaining check.

## 11. Median or mean over claps? (reviewer question, Sun 2026-11-15)

An architectural-acoustics graduate student asked how much our median over claps differs from the arithmetic mean that ISO 3382-2 uses for repeated measurements. Same usable claps (first 4 detected, at least 30 dB of clean decay), both rules, nothing else changed. Scripts: `median_vs_mean.mjs` and `mm_home.mjs` (Partner scratchpad; logic described here).

| Data | Takes with a T20 verdict | Mean vs median, 3-band average | Error against the pyrato reference (median rule / mean rule) | Verdict-zone changes |
|---|---|---|---|---|
| Simulated claps in 3 measured rooms (HOMULA-RIR, PAN-AR; every 3rd take of §10) | 149 | median 0.09 %, 90th percentile 0.35 %, max 1.38 % | median 0.88 % / 0.89 %; 90th percentile 2.81 % / 2.93 % | 0 |
| Our real home take, processing off (Friday) | 1 | −1.0 % (0.412 → 0.408 s). At 500 Hz one clap read 0.32 s against 0.38–0.39 s for the others, so the mean is 2.7 % lower there | — | 0 |

**Reading:** with simulated claps the two rules agree within about 1 %. With real claps, one odd clap moves the mean more than the median, which is why the engine keeps the median. The difference is far inside the ±15 % "Too close to call" zone. Not tested: many real takes.

## 12. Independent engine review and fixes (Sun 2026-11-15)

**What was run:** a reviewer agent briefed as a room-acoustics measurement expert (ISO 3382-2, IEC 61260-1, Lundeby 1995, JCGM 106) attacked `engine/echo-engine.js` with 380+ adversarial synthetic takes (two-slope and flutter decays, double claps, DC, hum, rumble, near-clipping, 44.1 kHz, late peaks, short rooms). Full report: Partner's `private/audit/ENGINE_REVIEW.md`.

**Found and fixed (commit after `c0ad6cd`; 5 new tests fail on the old engine and pass on the new one; 27 of 27 pass):**

| Finding | Effect on the old engine | Fix |
|---|---|---|
| **False pass on two-slope decays.** The single-pass noise cut-off fell while a slow late decay was still above the background | T20 read 20–62 % short; 17 of 380 adversarial takes read "Under" for rooms over the limit, all at lower confidence (30–37 dB of clean decay). Example: true T20 0.995 s, engine 0.494 s "Under". It also explains the 2 simulated-classroom false passes of §7 (not "late decay below the background" as §7 first said) | **Tail guard:** at lower confidence, if at least half of a band's used claps still have echo energy more than 3 dB above the background in the 300 ms after the cut-off, "Under" becomes "Too close to call". It can never create an "Under" |
| **44.1 kHz clap timing.** `detectClaps` assumed 1,000 frames per second; at 44.1 kHz a frame is 44 samples | Clap times 20–57 ms late; short clipping at the clap missed; clean decay 8–14 dB low (more Incomplete) | Frames per second = `fs / hop`. Identical results at 48 kHz |
| One NaN or infinite sample | Read as "No claps were heard" | Clear error naming the time of the bad sample |
| Reason wording "best 34 dB, need 30 dB" | Contradictory when one clap passed but a second was missing | Says how many claps reached 30 dB and how many are needed |

**Regression check (same takes, old vs new engine):**

| Set | Takes | Verdict changes | Echo-time change | False passes old → new |
|---|---|---|---|---|
| Simulated claps in 3 measured rooms (§10, 86/92/98 dB) | 540 | 0 | 0 | 0 → 0 |
| MIT IR Survey, both setups (§6, §9) | 206 | 0 | 0 | 0 → 0 |
| Simulated classrooms (§10, 86/92/98 dB) | 1,053 | 4, all "Under" → "Too close to call" | 0 | **2 → 0** (the other 2 changes were correct "Under" results that now read "Too close to call") |
| Simulated classrooms (§7, 74/80/86 dB) | 1,053 | 2, both "Under" → "Too close to call" | 0 | **2 → 0** (both changes were the false passes) |
| Real app in headless Chrome, 3 ACE takes × processing off/on | 6 | 0 | — | — |

**Still open (not fixed):** some extreme two-slope cases (late decay within about 16 dB of the background) still pass the guard (9 of the 17 adversarial false passes remain in the reviewer's grid); "clean decay" is measured from the direct-sound peak, not the decay's own range; a background 2–5 dB louder before the clap than during the decay biases T20 short by 3–8 %. This is why "Under" stays "weak evidence".
