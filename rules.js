(function () {
  'use strict';

  const cellKey = (x, y) => x + ',' + y;
  const same = (a, b) => a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
  const empty = level => Array(level.cargo.length).fill(null);
  const adjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

  function cellsFor(crate, placement) {
    if (!placement) return [];
    const [x, y, direction] = placement;
    if (crate.kind !== 'long') return [[x, y]];
    return [[x, y], direction ? [x, y + 1] : [x + 1, y]];
  }

  function inventory(level, placements) {
    const occupied = new Map();
    placements.forEach((place, id) => {
      for (const [x, y] of cellsFor(level.cargo[id], place)) occupied.set(cellKey(x, y), id);
    });
    return occupied;
  }

  function fits(level, placements, id, place) {
    const occupied = inventory(level, placements);
    for (const [x, y] of cellsFor(level.cargo[id], place)) {
      if (x === 0 || Math.abs(x) > level.columns || y < 0 || y >= level.rows) return false;
      const previous = occupied.get(cellKey(x, y));
      if (previous !== undefined && previous !== id) return false;
    }
    return true;
  }

  function inspect(level, placements, ballast = 0) {
    let left = ballast < 0 ? 1 : 0;
    let right = ballast > 0 ? 1 : 0;
    const occupied = inventory(level, placements);
    const fragile = new Set();
    const unlinked = new Set();
    const pairs = new Map();
    let loaded = 0;
    placements.forEach((place, id) => {
      if (!place) return;
      loaded++;
      const crate = level.cargo[id];
      const cells = cellsFor(crate, place);
      for (const [x] of cells) {
        const impact = crate.weight / cells.length * (level.lever ? Math.abs(x) : 1);
        if (x < 0) left += impact;
        else right += impact;
      }
      if (crate.kind === 'glass') {
        const [x, y] = place;
        const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of neighbors) {
          const heavy = occupied.get(cellKey(nx, ny));
          if (heavy !== undefined && level.cargo[heavy].weight >= 3) {
            fragile.add(id);
            fragile.add(heavy);
          }
        }
      }
      if (crate.pair) {
        if (!pairs.has(crate.pair)) pairs.set(crate.pair, []);
        pairs.get(crate.pair).push(id);
      }
    });
    for (const members of pairs.values()) {
      if (members.length === 2 && !adjacent(placements[members[0]], placements[members[1]])) {
        members.forEach(id => unlinked.add(id));
      }
    }
    const contract = level.contract;
    const contractOwner = contract ? occupied.get(cellKey(contract.x, contract.y)) : undefined;
    const contractMet = !!contract && (contract.kind === 'empty' ? contractOwner === undefined : contractOwner === contract.id);
    const cleanCargo = !fragile.size && !unlinked.size;
    const full = loaded === level.cargo.length;
    return { left, right, loaded, full, fragile, unlinked, cleanCargo, contractMet, ready: full && cleanCargo && left === right };
  }

  function canBallast(state) {
    return state.full && state.cleanCargo && Math.abs(state.left - state.right) === 1;
  }

  function reflect(level, anchors, horizontal, vertical) {
    return anchors.map((p, id) => {
      const long = level.cargo[id].kind === 'long';
      return [
        horizontal ? -p[0] - Number(long && p[2] === 0) : p[0],
        vertical ? level.rows - 1 - p[1] - Number(long && p[2] === 1) : p[1],
        p[2],
      ];
    });
  }

  function variants(level, placements) {
    const groups = new Map();
    level.cargo.forEach((c, id) => {
      const contractId = level.contract?.kind === 'mark' ? level.contract.id : -1;
      const group = c.pair || id === contractId ? 'id:' + id : c.kind + ':' + c.weight;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(id);
    });
    return [[false, false], [true, false], [false, true], [true, true]].map(([h, v]) => {
      const reflected = reflect(level, level.solution, h, v);
      const result = [];
      for (const ids of groups.values()) {
        const open = ids.map(id => reflected[id]);
        for (const id of ids) {
          const matched = open.findIndex(p => same(p, placements[id]));
          if (matched < 0) continue;
          result[id] = open.splice(matched, 1)[0];
        }
        for (const id of ids) if (!result[id]) result[id] = open.shift();
      }
      return result;
    });
  }

  function hint(level, placements, aimForContract = false) {
    let options = variants(level, placements);
    if (aimForContract) options = options.filter(option => inspect(level, option).contractMet);
    const score = candidate => candidate.reduce((n, place, id) => n + Number(placements[id] && !same(place, placements[id])), 0) * 2
      + (level.contract && !inspect(level, candidate).contractMet ? 1 : 0);
    options.sort((a, b) => score(a) - score(b));
    const target = options[0];
    for (let id = 0; id < target.length; id++) {
      if (same(target[id], placements[id])) continue;
      if (fits(level, placements, id, target[id])) return { id, place: target[id] };
    }
    const id = target.findIndex((place, i) => placements[i] && !same(place, placements[i]));
    return id < 0 ? null : { id, place: null };
  }

  function starCount(level, result, adjustments, ballast) {
    if (!level.contract) return 0;
    return !result.contractMet ? 1 : adjustments || ballast ? 2 : 3;
  }

  const api = { cellsFor, fits, inspect, hint, empty, same, canBallast, starCount, cellKey };
  if (typeof module === 'object') module.exports = api;
  else window.FerryRules = api;
})();
