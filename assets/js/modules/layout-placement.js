export function initLayoutPlacement() {
  const stamp = document.getElementById('topbarLogStamp');
  const scanBtn = document.getElementById('scanModeBtn');
  const scanWrap = document.getElementById('avScan');
  const modeSwitch = document.getElementById('activeViewModeSwitch');
  const activeViewPanel = document.getElementById('activeViewPanel');
  const activeViewBody = activeViewPanel ? activeViewPanel.querySelector('.bd') : null;
  const topbarLeft = document.querySelector('.topbar .left');
  const activeViewHeader = document.querySelector('#activeViewPanel .hd');

  if (!stamp || !topbarLeft || !activeViewHeader || !scanBtn || !modeSwitch || !scanWrap || !activeViewPanel || !activeViewBody) {
    return;
  }

  const mobileQuery = window.matchMedia('(max-width: 980px)');
  const optionalLeftPill = topbarLeft.querySelector('.optional.deep');

  function moveNode(node, parent, beforeNode) {
    if (!node || !parent) {
      return;
    }
    if (node.parentElement === parent && (!beforeNode || node.nextSibling === beforeNode)) {
      return;
    }
    parent.insertBefore(node, beforeNode || null);
  }

  function placeStamp() {
    moveNode(scanBtn, modeSwitch);
    moveNode(scanWrap, activeViewPanel, activeViewBody);

    if (mobileQuery.matches) {
      moveNode(stamp, activeViewHeader);
      scanBtn.classList.remove('mobile-topbar-scan');
      stamp.classList.add('mobile-activeview-log-stamp');
      return;
    }

    moveNode(stamp, topbarLeft, optionalLeftPill);
    scanBtn.classList.remove('mobile-topbar-scan');
    stamp.classList.remove('mobile-activeview-log-stamp');
  }

  let resizeTimer = null;
  const debouncedPlaceStamp = () => {
    if (resizeTimer !== null) {
      window.clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null;
      placeStamp();
    }, 150);
  };

  placeStamp();
  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', placeStamp);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(placeStamp);
  }
  window.addEventListener('orientationchange', debouncedPlaceStamp);
  window.addEventListener('resize', debouncedPlaceStamp);
}
