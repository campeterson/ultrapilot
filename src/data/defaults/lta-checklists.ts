import type { Checklist } from '../models'

const NOW = new Date(0).toISOString() // fixed seed time so IDs stay stable

function items(prefix: string, pairs: [string, string][]): Checklist['items'] {
  return pairs.map(([challenge, response], i) => ({
    id: `${prefix}-${i}`,
    text: `${challenge} — ${response}`,
    order: i,
  }))
}

function list(id: string, name: string, category: Checklist['category'], pairs: [string, string][]): Checklist {
  return { id, name, category, aircraft: 'lta', createdAt: NOW, updatedAt: NOW, items: items(id, pairs) }
}

// Generic hot-air balloon flow. Starting point only — the balloon's Flight
// Manual governs; pilots should edit these to match their system.
export const LTA_DEFAULT_CHECKLISTS: Checklist[] = [
  list('lta-briefing', 'Weather & Crew Briefing', 'preflight', [
    ['Weather Briefing', 'OBTAINED'],
    ['Surface & Upper Winds', 'ASSESSED / PIBAL'],
    ['Launch Site', 'PERMISSION & CLEAR'],
    ['Chase Crew', 'BRIEFED — ROLES & RADIO CH'],
    ['Chase Vehicle', 'FUELED & READY'],
    ['Documents', 'ON BOARD'],
  ]),
  list('lta-equipment', 'Equipment & Fuel', 'preflight', [
    ['Fuel Tanks', 'FULL — QTY CHECKED'],
    ['Tank Straps', 'SECURE'],
    ['Fuel Hoses & Fittings', 'CONDITION / NO LEAKS'],
    ['Burner Frame & Uprights', 'SECURE'],
    ['Basket, Cables & Carabiners', 'CONDITION / LOCKED'],
    ['Envelope Fabric & Load Tapes', 'CONDITION'],
    ['Parachute / Rip Line', 'CONDITION & ROUTED'],
    ['Temp Flag / Sensor', 'CHECKED'],
    ['Instruments', 'ON — ALT / VARIO / TEMP'],
    ['Igniters (2)', 'ON BOARD'],
    ['Fire Extinguisher', 'ON BOARD'],
    ['Drop Line & Gloves', 'ON BOARD'],
  ]),
  list('lta-burner', 'Burner Test', 'preflight', [
    ['Area', 'CLEAR OF CREW & ENVELOPE'],
    ['Fuel Valves', 'OPEN SLOWLY'],
    ['Leak Check', 'NONE — SMELL / SOUND'],
    ['Pilot Lights', 'LIT'],
    ['Main Blast Valves', 'TEST EACH'],
    ['Whisper / Cow Burner', 'TEST'],
    ['Fuel Pressure', 'CHECKED'],
  ]),
  list('lta-cold', 'Cold Inflation', 'preflight', [
    ['Basket', 'ON SIDE — RESTRAINED'],
    ['Restraint / Quick Release', 'SECURE TO VEHICLE'],
    ['Envelope', 'LAID OUT DOWNWIND'],
    ['Crown Line Crew', 'IN POSITION'],
    ['Mouth Crew', 'IN POSITION'],
    ['Parachute', 'SEATED / VELCRO TABS'],
    ['Inflation Fan', 'AREA CLEAR — START'],
  ]),
  list('lta-hot', 'Hot Inflation', 'before_takeoff', [
    ['Crew', 'CLEAR OF BURNER PATH'],
    ['Heat', 'SHORT BLASTS'],
    ['Envelope', 'RISING — CROWN LINE TENSION'],
    ['Basket', 'UPRIGHT'],
    ['Pilot', 'IN BASKET'],
  ]),
  list('lta-prelaunch', 'Before Liftoff', 'before_takeoff', [
    ['Passengers', 'BRIEFED — LANDING POSITION'],
    ['Fuel', 'QTY & VALVES CHECKED'],
    ['Instruments', 'ON & SET'],
    ['Parachute / Vent', 'SEATED'],
    ['Crown Line', 'STOWED / SECURED'],
    ['Weigh-Off', 'COMPLETE'],
    ['Overhead & Downwind', 'CLEAR'],
    ['Restraint', 'RELEASE'],
  ]),
  list('lta-inflight', 'In Flight', 'in_flight', [
    ['Fuel Quantity', 'MONITOR / SWITCH TANKS'],
    ['Envelope Temp', 'WITHIN LIMITS'],
    ['Altitude & Airspace', 'MONITOR'],
    ['Power Lines', 'LOOKOUT'],
    ['Chase Crew', 'RADIO CONTACT'],
  ]),
  list('lta-approach', 'Approach & Landing', 'before_landing', [
    ['Landing Site', 'SELECTED — CLEAR OF WIRES & LIVESTOCK'],
    ['Chase Crew', 'ADVISED'],
    ['Passengers', 'LANDING POSITION'],
    ['Loose Items', 'SECURE'],
    ['Fuel', 'SUFFICIENT FOR GO-AROUND'],
    ['Deflation Port', 'READY'],
  ]),
  list('lta-deflation', 'Deflation & Pack-Up', 'post_flight', [
    ['Deflation Port', 'OPEN'],
    ['Fuel Valves', 'CLOSED'],
    ['Pilot Lights', 'OFF'],
    ['Fuel Lines', 'BLED'],
    ['Crown Line Crew', 'IN POSITION'],
    ['Envelope', 'SQUEEZED & PACKED'],
    ['Landowner', 'THANKED'],
  ]),
]
