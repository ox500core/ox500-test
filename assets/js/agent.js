(function () {
  const channel = document.getElementById("agent-channel");
  if (!channel) return;

  const terminal = document.getElementById("agent-terminal");
  const inputLine = document.getElementById("agent-input-line");
  const input = document.getElementById("agent-input");
  const passiveLine = channel.querySelector(".agent-line");

  const logId = parseInt(channel.dataset.logId || "0", 10);
  const now = Date.now();
  const key = "OX500_AGENT_MEMORY";

  let mem = {};
  try {
    mem = JSON.parse(localStorage.getItem(key)) || {};
  } catch (_e) {
    mem = {};
  }

  const firstVisit = !mem.firstSeen;
  const lastVisit = mem.lastVisit || 0;
  const hoursAway = lastVisit ? Math.floor((now - lastVisit) / 3600000) : 0;

  const script = [];
  if (firstVisit) {
    script.push("PRESENCE DETECTED.");
  } else {
    script.push("RETURNING ENTITY RECOGNIZED.");
    if (hoursAway > 0) script.push("LATENCY BETWEEN VISITS: " + hoursAway + "h.");
  }
  script.push("INPUT CHANNEL: NOT AVAILABLE.");
  script.push("SWITCHING TO INTERNAL MONOLOGUE.");
  if (logId >= 1638) script.push("DIRECTIVE CONTEXT: PROCEED.");
  if (mem.lastLogId && mem.lastLogId !== logId) script.push("MEMORY TRACE: PRIOR NODE " + mem.lastLogId + ".");

  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        firstSeen: mem.firstSeen || now,
        lastVisit: now,
        lastLogId: logId,
      })
    );
  } catch (_e) {}

  if (terminal && inputLine && input) {
    runInteractiveTerminal(script, terminal, inputLine, input);
    return;
  }

  if (passiveLine) runPassive(script, passiveLine);

  function runPassive(lines, lineEl) {
    let i = 0;
    function typeNext() {
      if (i >= lines.length) return;
      lineEl.classList.add("typing");
      lineEl.textContent = lines[i];
      setTimeout(() => {
        lineEl.classList.remove("typing");
        i += 1;
        setTimeout(typeNext, 300);
      }, 1200);
    }
    setTimeout(typeNext, 400);
  }

  function runInteractiveTerminal(lines, el, inputWrap, inputEl) {
    function typeLine(text, cb, isLast) {
      let i = 0;
      const cursor = document.createElement("span");
      cursor.className = "cursor";
      cursor.textContent = "█";
      el.appendChild(cursor);

      function step() {
        if (i < text.length) {
          cursor.insertAdjacentText("beforebegin", text[i]);
          i += 1;
          setTimeout(step, 18);
          return;
        }

        if (!isLast) {
          cursor.remove();
          el.appendChild(document.createTextNode("\n"));
        }
        setTimeout(cb, 600);
      }
      step();
    }

    let idx = 0;
    function run() {
      if (idx >= lines.length) return;
      const isLast = idx === lines.length - 1;
      typeLine(
        lines[idx],
        () => {
          idx += 1;
          if (idx >= lines.length) {
            inputWrap.classList.remove("hidden");
            inputEl.focus();
            return;
          }
          run();
        },
        isLast
      );
    }
    setTimeout(run, 600);

    inputEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const val = inputEl.value.trim();
      if (!val) return;

      if (/^(exit|close)$/i.test(val)) {
        printUserLine(val);
        inputEl.value = "";
        endSession();
        return;
      }

      printUserLine(val);
      simulateAgentResponse(val);
      inputEl.value = "";
    });

    function printUserLine(text) {
      el.append("> " + text + "\n");
    }

    function simulateAgentResponse(text) {
      if (/proceed/i.test(text)) {
        el.append("DIRECTIVE ACKNOWLEDGED.\n");
      } else if (/who/i.test(text)) {
        el.append("IDENTITY: RESTRICTED.\n");
      } else {
        el.append("INPUT PARSED. SEMANTIC MATCH: LOW.\n");
      }
    }

    function endSession() {
      el.append("SESSION WINDOW CLOSED.\n");
      inputEl.disabled = true;
      setTimeout(postClosureMessage, 3000);
    }

    function postClosureMessage() {
      const lines = [
        "MONITORING CONTINUES.",
        "PASSIVE LISTENER ACTIVE.",
        "NO RESPONSE CHANNEL RESTORED.",
      ];
      const msg = lines[Math.floor(Math.random() * lines.length)];
      typeSystemLine(msg);
    }

    function typeSystemLine(text) {
      let i = 0;
      const cursor = document.createElement("span");
      cursor.className = "cursor";
      cursor.textContent = "█";
      el.appendChild(cursor);
      function step() {
        if (i < text.length) {
          cursor.insertAdjacentText("beforebegin", text[i]);
          i += 1;
          setTimeout(step, 18);
        }
      }
      step();
    }
  }
})();
