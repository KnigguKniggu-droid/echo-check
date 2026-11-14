# Reference values for the engine

Written by the Partner session, Friday 2026-11-13, about 21:10 CST. README Phase 1 rows 4 and 5.

## 1. Engine against synthetic decays (CI test)

`node --test engine/test/engine.test.js`: **16 of 16 pass.** Pass rule: every band T20 within 0.05 s or 5 % of the true T60, whichever is larger.

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

## 8. Real classrooms: measured impulse responses (HOMULA-RIR and PAN-AR; Saturday 11:30 CST)

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
- **0 false passes in 540 takes in real rooms. When a verdict is given, it is accurate (median error 0.6–4.3 %).**
- **All three rooms are over the limit,** so this test shows that the engine does not pass an over-limit room. It cannot check under-limit rooms (§4 and §6 do).
- **Distance matters most:** a seat 3.5 m from the clapper gives a verdict in most takes; seats 6.5 m or more away rarely do, with our assumed clap level.

**What changed in the product because of §7 and §8 (Saturday 11:35):**
1. The setup step now says: close the door and windows, switch off fans and the projector, and switch off loud ventilation if allowed; a quiet room is the most important condition.
2. "Incomplete" now says *why*: "No claps were heard clearly above the background noise" or "The claps were too quiet above the background at this seat (best N dB, need 30 dB)", with what to do (quieter room, cupped claps, a seat about 3–5 m from the clapper). New test; 21 of 21 tests pass.
3. **Open decision (team):** the device position. Today's evidence says 3–5 m from the clapper, not the far back row and not the front row. The README protocol says "back-row desk".
