/* Clavoris admin — data-room cards fold open and closed, like the folders inside a data room.
   A click (or Enter / Space) on the room name opens or closes the card; the name, the summary line and the buttons stay
   visible when it is closed. Closed by default when there are several rooms; each card's choice is remembered on this
   device. The buttons in the card header keep their own action. Loaded after admin.js and the other admin scripts. */
(function () {
  'use strict';
  var box = document.getElementById('rooms');
  if (!box) return;

  var css = document.createElement('style');
  css.textContent = ''
    + '#rooms .rf-head{cursor:pointer;user-select:none;border-radius:6px;outline:none}'
    + '#rooms .rf-head:focus-visible{box-shadow:0 0 0 2px var(--seal-gold)}'
    + '#rooms .rf-head div[style*="font-display"]{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
    + '#rooms .rf-head div[style*="font-display"]::before{content:"";flex:none;width:8px;height:8px;margin:0 4px 0 2px;border-right:2px solid var(--fg-3);border-bottom:2px solid var(--fg-3);transform:rotate(-45deg);transition:transform .15s ease}'
    + '#rooms .rf-open .rf-head div[style*="font-display"]::before{transform:rotate(45deg)}'
    + '#rooms .rf-head .mono{padding-left:22px}'
    + '#rooms > [data-room].rf:not(.rf-open) > :not(:first-child){display:none}'
    + '@media (prefers-reduced-motion: reduce){#rooms .rf-head div[style*="font-display"]::before{transition:none}}';
  document.head.appendChild(css);

  var KEY = 'clv_adm_room_';
  function stored(id) { try { return localStorage.getItem(KEY + id); } catch (e) { return null; } }
  function remember(id, open) { try { localStorage.setItem(KEY + id, open ? '1' : '0'); } catch (e) {} }

  function set(card, open) {
    card.classList.toggle('rf-open', open);
    var head = card.querySelector('.rf-head');
    if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function fold() {
    var cards = box.querySelectorAll(':scope > [data-room]');
    [].forEach.call(cards, function (card) {
      if (card.classList.contains('rf')) return;
      var bar = card.firstElementChild, head = bar && bar.firstElementChild;
      if (!head) return;
      var id = card.getAttribute('data-room');
      card.classList.add('rf');
      head.classList.add('rf-head');
      head.setAttribute('role', 'button'); head.setAttribute('tabindex', '0');
      head.title = 'Open or close this data room';
      var s = stored(id);
      set(card, s === null ? cards.length === 1 : s === '1');
      function toggle() { var open = !card.classList.contains('rf-open'); set(card, open); remember(id, open); }
      head.addEventListener('click', function (ev) { if (ev.target.closest('a, button, input, select, label')) return; toggle(); });
      head.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
    });
  }
  new MutationObserver(fold).observe(box, { childList: true });
  fold();
})();
