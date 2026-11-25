(function () {
  'use strict';

  const R = window.FerryRules;
  const levels = window.FerryLevels;
  const strings = window.FerryLang;
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const key = 'ferry-crossing-redmi-v2';
  const chapterStarts = [1, 9, 19, 29, 39, 51];
  const intros = {
    welcome:'introWelcome', weight:'introWeight', sum:'introSum', move:'introMove',
    lever:'introLever', long:'introLong', deck:'introDeck', pair:'introPair',
    four:'introFour', glass:'introGlass', wide:'introWide',
  };
  const defaultSave = () => ({ lang:'ru', sound:true, started:false, current:1, scores:{}, runs:{} });

  function read() {
    try {
      const previous = JSON.parse(localStorage.getItem(key));
      if (previous && strings[previous.lang] && levels[previous.current - 1] && previous.scores &&
          typeof previous.scores === 'object') return { ...defaultSave(), ...previous };
    } catch { /* A restricted browser can still play in this tab. */ }
    return defaultSave();
  }

  let save = read();
  let screen = 'menu';
  let level = levels[0];
  let run = null;
  let selected = null;
  let rotation = 0;
  let hintStage = 0;
  let feedback = '';
  let warning = false;
  let phase = '';
  let result = null;
  let dialogKind = '';
  let chapter = 0;
  let pointer = null;
  let ignoreClickUntil = 0;
  let audio;

  function store() {
    try { localStorage.setItem(key, JSON.stringify(save)); } catch { /* Play continues in this tab. */ }
  }

  function t(key, params = {}) {
    return (strings[save.lang][key] || key).replace(/\{(\w+)\}/g, (_, token) => params[token] ?? '');
  }

  const title = item => item.title[save.lang === 'en' ? 1 : 0];
  const cleared = id => Object.hasOwn(save.scores, id);
  const totalStars = () => levels.reduce((sum, item) => sum + (save.scores[item.id] || 0), 0);
  const nextUncleared = () => levels.find(item => !cleared(item.id))?.id;
  const getChapter = id => chapterStarts.slice(0, -1).findLastIndex(start => id >= start);
  const delay = ms => new Promise(resolve => setTimeout(resolve, reduced.matches ? 14 : ms));
  const bounds = el => el?.getBoundingClientRect();
  const piece = (id, root = $('screen')) => root.querySelector('[data-piece="' + id + '"]');
  const ship = () => R.inspect(level, run.places, run.ballast);
  const column = x => level.columns + x + 1;
  const xy = button => button.dataset.cell.split(',').map(Number);

  function playSound(kind) {
    if (!save.sound) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio ||= new Context();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const sketch = {
        select:[340], load:[212,295], undo:[286,207], sail:[196,247,295], win:[392,494,588], ballast:[305,457],
      };
      (sketch[kind] || sketch.select).forEach((frequency, i) => {
        const start = audio.currentTime + i * .065;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = kind === 'load' ? 'triangle' : 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.024, start + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
        osc.connect(gain).connect(audio.destination);
        osc.start(start);
        osc.stop(start + .16);
      });
    } catch { /* Sound is optional. */ }
  }

  function translate() {
    document.documentElement.lang = save.lang;
    document.title = t('title');
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll('[data-a]').forEach(el => {
      el.setAttribute('aria-label', t(el.dataset.a));
      if (el.tagName === 'BUTTON') el.title = t(el.dataset.a);
    });
    document.querySelectorAll('[data-lang]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.lang === save.lang)));
  }

  function setLanguage(lang) {
    if (!strings[lang] || save.lang === lang) return;
    save.lang = lang;
    store();
    translate();
    render();
    if (dialogKind) showDialog(dialogKind);
  }

  function setScreen(next) {
    screen = next;
    for (const name of ['menu','map','game']) $(name).hidden = name !== next;
    render();
  }

  function render() {
    if (screen === 'menu') {
      $('continue').disabled = !save.started;
      $('continue').classList.toggle('primary', save.started);
      $('new').classList.toggle('primary', !save.started);
      $('home-progress').textContent = t('done', { n:levels.filter(item => cleared(item.id)).length });
      $('sound').textContent = save.sound ? '♫' : '♪';
      $('sound').setAttribute('aria-pressed', String(save.sound));
      $('sound').setAttribute('aria-label', t(save.sound ? 'soundOn' : 'soundOff'));
    } else if (screen === 'map') renderMap();
    else if (run) renderGame();
  }

  function openMap() {
    closeDialog();
    chapter = getChapter(levels[save.current - 1]?.id || 1);
    setScreen('map');
  }

  function renderMap() {
    const first = chapterStarts[chapter], last = chapterStarts[chapter + 1];
    $('chapters').innerHTML = chapterStarts.slice(0, -1).map((start, i) =>
      '<button class="station" data-chapter="' + i + '" aria-pressed="' + (chapter === i) + '">' + start + '–' + (chapterStarts[i + 1] - 1) + '</button>'
    ).join('');
    const item = levels[first - 1];
    $('chapter-title').textContent = t('chapter' + (chapter + 1));
    $('chapter-size').textContent = t('capacity',{ n:item.rows * item.columns * 2, r:item.rows, rows:t(item.rows === 1 ? 'oneRow' : 'fewRows') });
    $('map-stars').textContent = '★ ' + totalStars();
    $('levels').innerHTML = levels.slice(first - 1, last - 1).map(item => {
      const done = cleared(item.id);
      const stars = save.scores[item.id] || 0;
      return '<button class="level-button' + (item.id === save.current ? ' current' : '') + '" data-level="' + item.id + '" aria-label="' +
        item.id + '. ' + title(item) + '"><span>' + item.id + '</span>' +
        '<small aria-hidden="true">' + (done ? stars ? '★'.repeat(stars) + '☆'.repeat(3-stars) : '✓' : '&nbsp;') + '</small></button>';
    }).join('');
    $('map-note').textContent = totalStars() >= 5 ? t('mapBallast') : t('mapStars',{n:totalStars()});
  }

  function validPlaces(item, places) {
    if (!Array.isArray(places) || places.length !== item.cargo.length) return false;
    const checked = R.empty(item);
    for (let id = 0; id < places.length; id++) {
      const place = places[id];
      if (!place) continue;
      if (!Array.isArray(place) || place.length !== 3 || !place.every(Number.isInteger) ||
          ![0, 1].includes(place[2]) || !R.fits(item, checked, id, place)) return false;
      checked[id] = place;
    }
    return true;
  }

  function restored(item) {
    const value = save.runs[item.id] || save.run;
    if (value?.id !== item.id || !validPlaces(item, value.places)) return null;
    const normalizeBallast = ballast => [-1, 1].includes(ballast) && totalStars() >= 5 ? ballast : 0;
    const history = (Array.isArray(value.history) ? value.history : []).slice(-80)
      .filter(step => step && validPlaces(item, step.places))
      .map(step => ({places:step.places,ballast:normalizeBallast(step.ballast)}));
    return {
      id:item.id, places:value.places, history, adjustments:Math.max(0, Number(value.adjustments) || 0),
      ballast:normalizeBallast(value.ballast),
    };
  }

  function persistRun() {
    const {id, places, adjustments, ballast, history} = run;
    save.runs[id] = {id, places, adjustments, ballast, history:history.slice(-80)};
    delete save.run;
    store();
  }

  async function openLevel(id, fresh = false) {
    if (!levels[id - 1]) return;
    closeDialog();
    level = levels[id - 1];
    run = (!fresh && restored(level)) || { id, places:R.empty(level), history:[], adjustments:0, ballast:0 };
    selected = null;
    rotation = 0;
    hintStage = 0;
    feedback = '';
    warning = false;
    result = null;
    save.started = true;
    save.current = id;
    persistRun();
    $('playfield').style.setProperty('--rows', level.rows);
    $('playfield').style.setProperty('--columns', level.columns);
    $('dock').scrollLeft = 0;
    phase = 'arrive';
    setScreen('game');
    await delay(600);
    phase = '';
    renderGame();
  }

  function markFor(id) { return level.contract?.kind === 'mark' && level.contract.id === id; }

  function crateName(id) {
    const c = level.cargo[id];
    return t('pieceName',{kind:t(c.kind),w:c.weight}) + (c.pair ? ', ' + t('pairName',{name:c.pair}) : '') +
      (markFor(id) ? ', ' + t('starred') : '');
  }

  function crateFace(id) {
    const c = level.cargo[id];
    return '<b>' + c.weight + '</b>' +
      (c.pair ? '<em>' + c.pair + '</em>' : '') +
      (c.kind === 'glass' ? '<span class="mark glass-mark" aria-hidden="true">◇</span>' : '') +
      (markFor(id) ? '<span class="mark star-mark" aria-hidden="true">★</span>' : '');
  }

  function pieceButton(id, place, guide, state, inactive) {
    const c = level.cargo[id];
    const occupied = !!place;
    const classes = ['piece', c.kind, 'weight-' + c.weight, occupied ? 'occupied' : 'dock-piece'];
    if (guide?.id === id) classes.push('hinting');
    if (state.fragile.has(id) || state.unlinked.has(id)) classes.push('conflict');
    const placement = occupied ? ' style="grid-column:' + column(place[0]) + '/span ' +
      (c.kind === 'long' && !place[2] ? 2 : 1) + ';grid-row:' + (place[1]+1) + '/span ' +
      (c.kind === 'long' && place[2] ? 2 : 1) + '"' : '';
    return '<button type="button" class="' + classes.join(' ') + '" data-piece="' + id + '" aria-pressed="' +
      (selected === id) + '" aria-label="' + crateName(id) + '"' + placement + inactive + '>' + crateFace(id) + '</button>';
  }

  function printDeck(guide, locked) {
    let content = '', arms = '';
    for (let x = -level.columns; x <= level.columns; x++) {
      if (!x) continue;
      const arm = level.lever ? Math.abs(x) : 1;
      if (level.lever) arms += '<span style="grid-column:' + column(x) + '">×' + arm + '</span>';
      for (let y = 0; y < level.rows; y++) {
        const isContract = level.contract?.x === x && level.contract?.y === y;
        const valid = selected !== null && R.fits(level,run.places,selected,[x,y,rotation]);
        const highlighted = guide?.place?.[0] === x && guide.place[1] === y;
        const cls = ['cell', valid ? 'valid' : '', isContract ? 'contract-cell' : '', highlighted ? 'hinting' : ''];
        const accessible = t('cell',{side:t(x<0?'leftSide':'rightSide'),row:y+1,arm});
        content += '<button class="' + cls.join(' ') + '" style="grid-column:' + column(x) + ';grid-row:' +
          (y+1) + '" data-cell="' + x + ',' + y + '" aria-label="' + accessible + '"' + locked + '>' + (isContract ? '★' : '·') + '</button>';
      }
    }
    $('arms').innerHTML = arms;
    $('deck').innerHTML = content;
  }

  function currentMessage(state, guide) {
    if (phase) return phase === 'arrive' ? t('arriving') : phase === 'depart' ? t('leaving') : t('sailEnd');
    if (feedback) return t(feedback);
    if (guide) {
      if (!guide.place) return t('hintRemove');
      if (level.cargo[guide.id].kind === 'long' && selected === guide.id && rotation !== guide.place[2]) {
        return t('hintTurn',{direction:t(guide.place[2]?'vertical':'horizontal')});
      }
      return t('hintAim');
    }
    if (hintStage === 1) return t(state.ready && level.contract && !state.contractMet
      ? level.contract.kind === 'empty' ? 'contractClear' : 'contractMark'
      : mechanicHint(state));
    if (state.ready) return t('ready');
    if (!run.history.length && intros[level.intro]) return t(intros[level.intro]);
    if (state.fragile.size) return t('glassError');
    if (state.unlinked.size && state.full) return t('pairError');
    if (selected !== null) return t('selected');
    if (state.full) return t(state.left > state.right ? 'listLeft' : 'listRight');
    return t('generic');
  }

  function updateDockArrows() {
    const track = $('dock');
    $('dock-prev').disabled = !!phase || track.scrollLeft <= 1;
    $('dock-next').disabled = !!phase || track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  }

  function renderGame() {
    const active = document.activeElement;
    const focusPiece = active?.dataset?.piece;
    const focusCell = active?.dataset?.cell;
    const state = ship();
    const initialGuide = level.id === 1 && run.adjustments === 0 && hintStage !== 1;
    const contractGuide = hintStage === 2 && state.ready && !!level.contract && !state.contractMet;
    const guide = !phase && (contractGuide || !state.ready && (hintStage === 2 || initialGuide))
      ? R.hint(level, run.places, contractGuide) : null;
    const locked = phase ? ' disabled' : '';
    const oldScroll = $('dock').scrollLeft;
    const imbalance = state.right - state.left;
    $('level-number').textContent = t('level',{n:level.id});
    $('level-title').textContent = title(level);
    $('left').textContent = state.left;
    $('right').textContent = state.right;
    $('compare').textContent = state.left === state.right ? '=' : state.left > state.right ? '>' : '<';
    $('gauges').classList.toggle('balanced', state.ready);
    $('gauges').classList.toggle('unbalanced', imbalance !== 0);
    $('ferry').style.setProperty('--heel', Math.max(-7,Math.min(7,imbalance * .69)) + 'deg');
    $('ferry-motion').className = 'ferry-motion' + (phase === 'depart' || phase === 'delivered' ? ' depart' : phase === 'arrive' ? ' arrive' : '');
    $('playfield').classList.toggle('motion', Boolean(phase));
    $('trip-status').hidden = !phase;
    $('trip-status').textContent = phase === 'arrive' ? t('arriving') : phase === 'depart' ? t('leaving') : t('sailEnd');
    printDeck(guide, locked);
    $('dock').innerHTML = level.cargo.map((_, id) => run.places[id] ? '' : pieceButton(id,null,guide,state,locked)).join('') ||
      '<p>' + t('emptyDock') + '</p>';
    $('dock').scrollLeft = oldScroll;
    $('placed').innerHTML = run.places.map((place,id) => place ? pieceButton(id, place,guide,state,locked) : '').join('');
    $('cargo-count').textContent = t('loaded',{n:state.loaded, all:level.cargo.length});
    $('message').textContent = currentMessage(state,guide);
    $('brief').classList.toggle('is-warn', warning || state.fragile.size > 0 || state.unlinked.size > 0 && state.full);
    $('contract').textContent = level.contract ? t(state.contractMet && state.full ? 'contractCheck' : level.contract.kind === 'empty' ? 'contractClear' : 'contractMark') : '';
    $('contract').classList.toggle('met', state.contractMet && state.full);
    $('sail').disabled = Boolean(phase) || !state.ready;
    $('sail').textContent = t(phase === 'depart' ? 'sailing' : phase === 'delivered' ? 'landed' : 'sail');
    $('pause').disabled = Boolean(phase);
    $('undo').disabled = Boolean(phase) || !run.history.length;
    $('hint').disabled = Boolean(phase);
    $('hint').setAttribute('aria-label',t(hintStage === 1 ? 'showMove' : 'hint'));
    $('hint').title = t(hintStage === 1 ? 'showMove' : 'hint');
    $('hint').classList.toggle('hinting', hintStage === 1);
    $('rotate').hidden = selected === null || level.cargo[selected].kind !== 'long';
    $('rotate').disabled = Boolean(phase);
    $('rotate').setAttribute('aria-pressed', String(rotation === 1));
    $('remove').hidden = selected === null || !run.places[selected];
    $('remove').disabled = Boolean(phase);
    $('ballast').hidden = !level.contract;
    $('ballast').disabled = Boolean(phase);
    $('ballast').classList.toggle('unlocked', totalStars() >= 5);
    $('ballast').classList.toggle('refill',totalStars() >= 5 && !run.ballast && R.canBallast(state));
    $('ballast').textContent = t(run.ballast ? 'ballastUsed' : 'ballast');
    updateDockArrows();
    if (!locked && focusPiece !== undefined) piece(Number(focusPiece))?.focus({preventScroll:true});
    if (!locked && focusCell !== undefined) $('deck').querySelector('[data-cell="' + focusCell + '"]')?.focus({preventScroll:true});
  }

  function mechanicHint(state) {
    if (state.fragile.size || level.cargo[selected]?.kind === 'glass') return 'hintGlass';
    if (state.unlinked.size || level.cargo[selected]?.pair) return 'hintPair';
    if (level.cargo[selected]?.kind === 'long') return 'hintLong';
    if (level.intro === 'glass') return 'hintGlass';
    if (level.intro === 'pair') return 'hintPair';
    if (level.intro === 'long') return 'hintLong';
    return level.lever ? 'hintLever' : 'hintBasic';
  }

  function useHint() {
    if (phase) return;
    fact('');
    hintStage = hintStage < 2 ? hintStage + 1 : 0;
    renderGame();
    if (hintStage === 2) {
      const current = ship();
      const move = R.hint(level,run.places,current.ready && !!level.contract && !current.contractMet);
      if (move && !run.places[move.id]) revealDockPiece(move.id);
    }
    playSound('select');
  }

  function revealDockPiece(id) {
    const track = $('dock'), node = piece(id, track);
    if (!node) return;
    const {left,right} = track.getBoundingClientRect();
    const item = node.getBoundingClientRect();
    if (item.left < left + 3) track.scrollLeft -= left + 3 - item.left;
    else if (item.right > right - 3) track.scrollLeft += item.right - right + 3;
  }

  function fact(key, alert = false) { feedback = key; warning = alert; }

  function choose(id) {
    if (phase || !level.cargo[id]) return;
    selected = selected === id ? null : id;
    rotation = selected === null ? 0 : run.places[id]?.[2] || 0;
    fact('');
    renderGame();
    playSound('select');
  }

  function remember() {
    if (run.history.length === 80) run.history.shift();
    run.history.push({ places:run.places.slice(), ballast:run.ballast });
  }

  function flyer(id, from, target) {
    if (reduced.matches || !from?.width || !target || !target.animate) return;
    const to = target.getBoundingClientRect();
    if (!to.width || (to.right < 0 || to.left > innerWidth)) return;
    const clone = target.cloneNode(true);
    clone.removeAttribute('data-piece');
    clone.removeAttribute('style');
    clone.removeAttribute('aria-pressed');
    clone.classList.remove('hinting','occupied','dock-piece');
    clone.classList.add('cargo-float');
    clone.tabIndex = -1;
    clone.setAttribute('aria-hidden','true');
    clone.style.left = from.left + 'px';
    clone.style.top = from.top + 'px';
    clone.style.width = from.width + 'px';
    clone.style.height = from.height + 'px';
    document.body.append(clone);
    const dx = to.left - from.left, dy = to.top - from.top;
    target.classList.add('in-air');
    const animation = clone.animate([
      {transform:'translate(0,0)'},
      {transform:'translate(' + dx * .58 + 'px,' + (dy * .57 - 17) + 'px) rotate(-5deg)'},
      {transform:'translate(' + dx + 'px,' + dy + 'px) scale(' + to.width / from.width + ',' + to.height / from.height + ')'},
    ], {duration:260,easing:'cubic-bezier(.2,.72,.31,1)',fill:'both'});
    animation.finished.catch(() => {}).finally(() => { clone.remove(); target.classList.remove('in-air'); });
  }

  function act(id, next, origin = null) {
    if (phase || id === null || !level.cargo[id]) return false;
    const prior = run.places[id];
    if (R.same(prior, next)) return false;
    if (next && !R.fits(level,run.places,id,next)) {
      fact('fitError', true);
      renderGame();
      return false;
    }
    const from = origin || bounds(piece(id));
    remember();
    if (prior) run.adjustments++;
    run.places[id] = next;
    selected = null;
    rotation = 0;
    fact('');
    persistRun();
    renderGame();
    if (!next) revealDockPiece(id);
    flyer(id,from,piece(id));
    playSound('load');
    return true;
  }

  function undo() {
    if (phase || !run.history.length) return;
    const prior = run.history.pop();
    if (run.places.some((place,id) => !R.same(place,prior.places[id]))) run.adjustments++;
    run.places = prior.places;
    run.ballast = prior.ballast;
    selected = null;
    rotation = 0;
    fact('');
    persistRun();
    renderGame();
    playSound('undo');
  }

  function rotateSelected() {
    if (phase || selected === null || level.cargo[selected].kind !== 'long') return;
    rotation = 1 - rotation;
    fact('');
    renderGame();
    playSound('select');
  }

  function controls(entries) {
    return '<div class="dialog-actions">' + entries.map(([action,label,primary,disabled]) =>
      '<button class="station' + (primary ? ' primary' : '') + '" data-action="' + action + '"' + (disabled?' disabled':'') + '>' + t(label) + '</button>'
    ).join('') + '</div>';
  }

  function showDialog(kind) {
    dialogKind = kind;
    let body = '';
    if (kind === 'new') {
      body = '<h2 id="dialog-title">' + t('newTitle') + '</h2><p>' + t('newBody') + '</p>' + controls([['reset','start',true],['close','cancel']]);
    } else if (kind === 'help') {
      const tip = screen === 'game' ? '<p><strong>' + t(intros[level.intro] || mechanicHint(ship())) + '</strong></p>' : '';
      body = '<h2 id="dialog-title">' + t('aboutTitle') + '</h2>' + tip + '<ol>' +
        ['about1','about2','about3','about4','about5'].map(label => '<li>' + t(label) + '</li>').join('') +
        '</ol>' + controls([['close','close',true]]);
    } else if (kind === 'pause') {
      body = '<h2 id="dialog-title">' + t('pause') + '</h2>' + controls([
        ['close','continue',true],['restart','restart'],['help','rulesMenu'],['map','levelMap'],['home','toMenu'],
      ]) + '<div class="lang dialog-language" aria-label="' + t('language') + '"><button data-lang="ru" aria-pressed="' +
        (save.lang === 'ru') + '">RU</button><button data-lang="en" aria-pressed="' + (save.lang === 'en') + '">EN</button></div>';
    } else if (kind === 'ballast') {
      const count = totalStars();
      const state = ship();
      const eligibility = count < 5 ? t('ballastLocked',{n:count}) : run.ballast ? t('ballastActive') : !R.canBallast(state) ? t('ballastUnavailable') : '';
      body = '<h2 id="dialog-title">' + t('ballastTitle') + '</h2><p>' + t('ballastAbout') + '</p>' +
        (eligibility ? '<p>' + eligibility + '</p>' : '') +
        controls(eligibility ? [['close','close',true]] : [['apply-ballast','ballastApply',true],['close','cancel']]);
    } else if (kind === 'win') {
      const goal = result.stars;
      const subtitle = goal ? t('starResult',{n:goal}) : t('pickedAll');
      const medal = goal ? '<div class="stars" aria-label="' + subtitle + '">' +
        [0,1,2].map(i => '<span aria-hidden="true" style="--i:' + i + '" class="' + (i<goal?'earned':'') + '">★</span>').join('') +
        '</div><div class="score-line" aria-hidden="true"><i style="width:' + goal / 3 * 100 + '%"></i></div>' : '';
      const detail = goal === 3 ? 'cleanResult' : goal === 2 ? 'movedResult' : goal === 1 ? 'lostContract' : '';
      const next = level.id < 50 ? [['next','next',true]] : [];
      body = '<h2 id="dialog-title">' + t(nextUncleared() ? 'finished' : 'finishedAll') + '</h2>' + medal +
        '<p>' + subtitle + '</p>' + (detail ? '<p>' + t(detail) + '</p>' : '') +
        (result.ballastUnlocked ? '<p><strong>' + t('unlockedBallast') + '</strong></p>' : '') +
        controls([...next,['map','levelMap'],['restart','replay']]);
    }
    $('dialog-content').innerHTML = body;
    if (!$('dialog').open) $('dialog').showModal();
  }

  function closeDialog() {
    dialogKind = '';
    if ($('dialog').open) $('dialog').close();
  }
  $('dialog').addEventListener('close', () => { if (!$('dialog').open) dialogKind = ''; });
  $('dialog').addEventListener('cancel', event => {
    event.preventDefault();
    if (dialogKind === 'win') openMap();
    else closeDialog();
  });

  function applyBallast() {
    const state = ship();
    if (phase || run.ballast || totalStars() < 5 || !R.canBallast(state)) return;
    closeDialog();
    remember();
    run.ballast = state.left < state.right ? -1 : 1;
    persistRun();
    fact('ballastUsed');
    playSound('ballast');
    renderGame();
  }

  async function sail() {
    if (phase) return;
    const ready = ship();
    if (!ready.ready) return;
    selected = null;
    hintStage = 0;
    fact('');
    phase = 'depart';
    $('sail').blur();
    playSound('sail');
    renderGame();

    const before = totalStars();
    const stars = R.starCount(level,ready,run.adjustments,run.ballast);
    save.scores[level.id] = Math.max(save.scores[level.id] || 0, stars);
    save.current = levels[level.id]?.id || nextUncleared() || level.id;
    delete save.runs[level.id];
    result = { stars, ballastUnlocked:before < 5 && totalStars() >= 5 };
    store();
    await delay(865);
    phase = 'delivered';
    renderGame();
    playSound('win');
    showDialog('win');
  }

  function reset() {
    const {lang,sound} = save;
    save = {...defaultSave(),lang,sound};
    closeDialog();
    openLevel(1,true);
  }

  function returnHome() {
    phase = '';
    closeDialog();
    setScreen('menu');
  }

  function clearPreview() {
    $('deck').querySelectorAll('.preview').forEach(cell => cell.classList.remove('preview'));
  }

  function cellAt(clientX, clientY) {
    const node = document.elementFromPoint(clientX,clientY);
    if (!node || !node.closest('#playfield')) return null;
    const direct = node.closest('[data-cell]');
    if (direct) return direct;
    return [...$('deck').children].find(el => {
      const r = bounds(el);
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    });
  }

  function paintPreview(cell, id, direction) {
    clearPreview();
    if (!cell) return;
    const [x,y] = xy(cell);
    const place = [x,y,direction];
    if (!R.fits(level,run.places,id,place)) return;
    for (const [cx,cy] of R.cellsFor(level.cargo[id],place)) {
      $('deck').querySelector('[data-cell="' + cx + ',' + cy + '"]')?.classList.add('preview');
    }
  }

  function finishPointer(event, cancel = false) {
    if (!pointer || event.pointerId !== pointer.key) return;
    const drag = pointer;
    pointer = null;
    clearPreview();
    if (!drag.ghost) return;
    ignoreClickUntil = performance.now() + 330;
    const origin = bounds(drag.ghost);
    drag.ghost.remove();
    drag.source.classList.remove('detached');
    if (!cancel) {
      const target = cellAt(event.clientX,event.clientY);
      if (target) act(drag.id, [...xy(target),drag.rotation], origin);
      else if ($('dock').contains(document.elementFromPoint(event.clientX,event.clientY)) && run.places[drag.id]) act(drag.id,null,origin);
    }
  }

  $('screen').addEventListener('pointerdown', event => {
    const source = event.target.closest('[data-piece]');
    if (!source || phase || !event.isPrimary || event.button !== 0) return;
    const id = Number(source.dataset.piece);
    pointer = { key:event.pointerId, id, source, origin:bounds(source), x:event.clientX, y:event.clientY,
      rotation:selected === id ? rotation : run.places[id]?.[2] || 0 };
  });

  document.addEventListener('pointermove', event => {
    const drag = pointer;
    if (!drag || event.pointerId !== drag.key) return;
    if (!drag.ghost && Math.hypot(event.clientX-drag.x,event.clientY-drag.y) > 7) {
      drag.ghost = drag.source.cloneNode(true);
      drag.ghost.removeAttribute('data-piece');
      drag.ghost.removeAttribute('style');
      drag.ghost.removeAttribute('aria-pressed');
      drag.ghost.classList.remove('occupied','hinting','dock-piece');
      drag.ghost.classList.add('cargo-float');
      drag.ghost.tabIndex = -1;
      drag.ghost.setAttribute('aria-hidden','true');
      drag.ghost.style.width = drag.origin.width + 'px';
      drag.ghost.style.height = drag.origin.height + 'px';
      document.body.append(drag.ghost);
      drag.source.classList.add('detached');
      drag.source.setPointerCapture?.(event.pointerId);
    }
    if (!drag.ghost) return;
    drag.ghost.style.left = drag.origin.left + event.clientX - drag.x + 'px';
    drag.ghost.style.top = drag.origin.top + event.clientY - drag.y + 'px';
    paintPreview(cellAt(event.clientX,event.clientY), drag.id, drag.rotation);
  });
  document.addEventListener('pointerup', event => finishPointer(event));
  document.addEventListener('pointercancel', event => finishPointer(event,true));

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if ((button.dataset.piece !== undefined || button.dataset.cell !== undefined) && performance.now() < ignoreClickUntil) return;
    if (button.dataset.lang) { setLanguage(button.dataset.lang); return; }
    if (button.dataset.piece !== undefined) {
      choose(Number(button.dataset.piece));
      return;
    }
    if (button.dataset.cell !== undefined) {
      if (selected !== null) act(selected,[...xy(button),rotation]);
      else { fact('pickFirst'); renderGame(); }
      return;
    }
    if (button.dataset.level) { openLevel(Number(button.dataset.level)); return; }
    if (button.dataset.chapter !== undefined) {
      chapter = Number(button.dataset.chapter);
      renderMap();
      return;
    }
    if (button.dataset.action) {
      const action = button.dataset.action;
      if (action === 'close') closeDialog();
      if (action === 'restart') openLevel(level.id,true);
      if (action === 'home') returnHome();
      if (action === 'map') { phase = ''; openMap(); }
      if (action === 'next') openLevel(level.id+1);
      if (action === 'reset') reset();
      if (action === 'help') showDialog('help');
      if (action === 'apply-ballast') applyBallast();
    }
  });

  $('new').onclick = () => {
    playSound('select');
    if (save.started) showDialog('new');
    else openLevel(1);
  };
  $('continue').onclick = () => nextUncleared() ? openLevel(save.current) : openMap();
  $('map-action').onclick = openMap;
  $('map-back').onclick = returnHome;
  $('sound').onclick = () => { save.sound = !save.sound; store(); playSound('select'); render(); };
  $('home-help').onclick = () => showDialog('help');
  $('pause').onclick = () => showDialog('pause');
  $('undo').onclick = undo;
  $('hint').onclick = useHint;
  $('sail').onclick = sail;
  $('rotate').onclick = rotateSelected;
  $('remove').onclick = () => { if (selected !== null && run.places[selected]) act(selected,null); };
  $('ballast').onclick = () => showDialog('ballast');
  $('dock-prev').onclick = () => $('dock').scrollBy({left:-$('dock').clientWidth*.66,behavior:reduced.matches?'instant':'smooth'});
  $('dock-next').onclick = () => $('dock').scrollBy({left:$('dock').clientWidth*.66,behavior:reduced.matches?'instant':'smooth'});
  $('dock').addEventListener('scroll',updateDockArrows,{passive:true});
  window.addEventListener('resize',updateDockArrows);
  document.addEventListener('keydown', event => {
    if (screen !== 'game' || phase || $('dialog').open) return;
    if (event.key === 'Escape') { event.preventDefault(); showDialog('pause'); }
    if (event.code === 'KeyR') rotateSelected();
  });

  if (!save.started && !localStorageVisible() && /^en\b/i.test(navigator.language)) save.lang = 'en';
  function localStorageVisible() {
    try { return Boolean(localStorage.getItem(key)); } catch { return false; }
  }
  translate();
  setScreen('menu');
})();
