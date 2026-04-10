# UltraPilot — Project Brief

## Vision

A unified cockpit companion app for ultralight and PPC pilots — combining GPS flight tracking, timestamped event logging, checklists, weather, and nearby airport awareness into a single offline-first PWA. Think "ForeFlight for ultralight pilots" without the advanced flight planning, subscription fees, or account requirements.

UltraPilot replaces several standalone Aviator's Toolkit apps (UltraPilot flight tracker, Flight Timer, Aviator Checklist) with one integrated experience where all data flows into a single exportable flight timeline.

## Target Users

- PPC (Powered Parachute) pilots — primary audience, completely ignored by mainstream aviation apps
- Ultralight pilots (Part 103)
- Light Sport pilots
- Sport Pilot certificate holders
- Any GA pilot who wants a simple, free, offline flight companion

## Core Problem

Ultralight and PPC pilots have no integrated cockpit app. ForeFlight costs $120+/year and targets IFR-capable GA aircraft. Garmin Pilot requires Garmin hardware. Free alternatives are either single-purpose (just a timer, just a checklist) or require accounts and internet connectivity. PPC operations have unique workflows (wing layout, dual engine cycles, foot steering) that no existing app acknowledges.

## What UltraPilot Is

- A map-centric flight companion with configurable instruments
- A session-based timeline that captures the full story of a flight day
- A checklist runner integrated into the flight timeline
- A METAR viewer and nearby airport finder
- An offline-first PWA that works without cell service at rural airfields
- Free, no account required

## What UltraPilot Is Not

- Not a flight planner (no route creation, no waypoints — that's a premium-tier future feature)
- Not an EFB replacement for IFR operations
- Not a logbook (export GPX/JSON and import into Pilot Logbook or other apps)
- Not a traffic display (GDL-90 ADS-B support deferred until native app)

## Success Criteria

1. A PPC pilot can run the app on a phone mounted in the cart, see their position on a map with live instruments, stamp events throughout the session, run checklists, and export a GPX file of the flight — all without internet
2. The same app works on a tablet with a split-view layout matching established EFB patterns (Garmin Pilot)
3. The app loads fast, works offline after first visit, and feels responsive at 28 knots and 500 feet AGL

## Relationship to Aviator's Toolkit

UltraPilot is the flagship app of the Aviator's Toolkit (aviatortoolkit.com). It is the most complex and capable tool in the suite. It should share the same design system (B612 font, color tokens, PWA architecture) but is a standalone app with its own URL and service worker.
