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

  function canLift(level, placements, id, occupied = inventory(level, placements)) {
    return cellsFor(level.cargo[id], placements[id]).every(([x, y]) => {
      const above = occupied.get(cellKey(x, y + 1));
      return above === undefined || above === id;
    });
  }

  function fits(level, placements, id, place) {
    const occupied = inventory(level, placements);
    if (!canLift(level, placements, id, occupied)) return false;
    const footprint = cellsFor(level.cargo[id], place);
    const own = new Set(footprint.map(([x, y]) => cellKey(x, y)));
    return footprint.every(([x, y]) => {
      if (x === 0 || Math.abs(x) > level.columns || y < 0 || y >= level.rows) return false;
      const previous = occupied.get(cellKey(x, y));
      if (previous !== undefined && previous !== id) return false;
      const below = cellKey(x, y - 1);
      const support = occupied.get(below);
      return y === 0 || own.has(below) || (support !== undefined && support !== id);
    });
  }

  function loadingOrder(level, placements) {
    const built = empty(level);
    const pending = placements.map((place, id) => place ? id : null).filter(id => id !== null);
    const order = [];
    while (pending.length) {
      const available = pending.findIndex(id => fits(level, built, id, placements[id]));
      if (available < 0) return null;
      const [id] = pending.splice(available, 1);
      built[id] = placements[id];
      order.push(id);
    }
    return order;
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

  function hint(level, placements) {
    const target = level.solution;
    const targetDeck = inventory(level, target);
    const order = target.map((_, id) => id).sort((a, b) => target[a][1] - target[b][1]);
    const settled = new Set();

    function hasSupports(id) {
      return cellsFor(level.cargo[id], target[id]).every(([x, y]) => {
        if (y === 0) return true;
        const support = targetDeck.get(cellKey(x, y - 1));
        return support === id || settled.has(support);
      });
    }

    for (const id of order) {
      if (same(placements[id], target[id]) && hasSupports(id)) settled.add(id);
    }
    // Follow the reference loading order without removing crates already resting on it.
    for (const id of order) {
      if (!settled.has(id) && hasSupports(id) && fits(level, placements, id, target[id])) {
        return { id, place: target[id] };
      }
    }
    const occupied = inventory(level, placements);
    const top = order.reverse().find(id => !settled.has(id) && placements[id] && canLift(level, placements, id, occupied));
    return top === undefined ? null : { id: top, place: null };
  }

  function starCount(level, result, adjustments, ballast) {
    if (!level.contract) return 0;
    return !result.contractMet ? 1 : adjustments || ballast ? 2 : 3;
  }

  const api = { cellsFor, fits, canLift, loadingOrder, inspect, hint, empty, same, canBallast, starCount, cellKey };
  if (typeof module === 'object') module.exports = api;
  else window.FerryRules = api;
})();
