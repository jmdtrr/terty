const TOTAL_DAYS = 30;
    const REST_SECONDS = 90;
    const STORAGE_STATE = "workoutSchedulerState";
    const STORAGE_START = "workoutSchedulerStartDate";
    const STORAGE_NOTIFY = "workoutSchedulerNotify";
    const STORAGE_THEME = "workoutSchedulerTheme";
    const STORAGE_MOBILE_TAB = "workoutSchedulerMobileTab";
    const STORAGE_PROGRESS = "workoutSchedulerProgress";

    let currentDay = 1;
    let timerRemaining = REST_SECONDS;
    let timerIntervalId = null;

    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const workoutContent = document.getElementById("workoutContent");
    const calendarGrid = document.getElementById("calendarGrid");
    const notifyToggle = document.getElementById("notifyToggle");
    const exportBtn = document.getElementById("exportBtn");
    const importBtn = document.getElementById("importBtn");
    const importFile = document.getElementById("importFile");
    const setRestDayBtn = document.getElementById("setRestDayBtn");
    const setWorkoutDayBtn = document.getElementById("setWorkoutDayBtn");
    const restPickedDayText = document.getElementById("restPickedDayText");
    const syncStatus = document.getElementById("syncStatus");
    const lastSavedText = document.getElementById("lastSavedText");
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const mobileTabs = document.getElementById("mobileTabs");
    const mobileTabButtons = mobileTabs.querySelectorAll(".mobile-tab");
    const mobilePanes = document.querySelectorAll(".mobile-pane");
    const toolsPanel = document.getElementById("toolsPanel");
    const mobileMq = window.matchMedia("(max-width: 639px)");

    let activeMobileTab = localStorage.getItem(STORAGE_MOBILE_TAB) || "workout";
    let progressState = null;
    let customizeOpenDay = null;
    let customDraftByDay = {};

    function safeParse(value, fallback) {
      try {
        return JSON.parse(value);
      } catch (_) {
        return fallback;
      }
    }

    function getPreferredTheme() {
      const saved = localStorage.getItem(STORAGE_THEME);
      if (saved === "light" || saved === "dark") {
        return saved;
      }

      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }

      return "light";
    }

    function applyTheme(theme) {
      document.body.setAttribute("data-theme", theme);
      localStorage.setItem(STORAGE_THEME, theme);
      themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
      themeToggleBtn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }

    function toggleTheme() {
      const current = document.body.getAttribute("data-theme") || "light";
      applyTheme(current === "dark" ? "light" : "dark");
    }

    function applyMobileTabLayout() {
      if (!mobileMq.matches) {
        document.body.classList.remove("mobile-has-tabs");
        mobilePanes.forEach((pane) => pane.classList.remove("active"));
        mobileTabButtons.forEach((btn) => {
          btn.classList.remove("active");
          btn.setAttribute("aria-selected", "false");
        });
        return;
      }

      document.body.classList.add("mobile-has-tabs");
      if (activeMobileTab !== "plan" && activeMobileTab !== "workout" && activeMobileTab !== "tools") {
        activeMobileTab = "workout";
      }

      mobilePanes.forEach((pane) => {
        pane.classList.toggle("active", pane.dataset.pane === activeMobileTab);
      });

      mobileTabButtons.forEach((btn) => {
        const isActive = btn.dataset.tab === activeMobileTab;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      localStorage.setItem(STORAGE_MOBILE_TAB, activeMobileTab);
    }

    function setMobileTab(tab) {
      activeMobileTab = tab;
      applyMobileTabLayout();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function normalizeCompletions(values, day, maxOverride = null) {
      if (!Array.isArray(values)) {
        return [];
      }

      const max = Number.isInteger(maxOverride)
        ? maxOverride
        : (getWorkout(day).exercises ? getWorkout(day).exercises.length - 1 : -1);
      return [...new Set(values)]
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= max)
        .sort((a, b) => a - b);
    }

    function normalizeProgressState(raw) {
      const normalized = {
        version: 1,
        day: null,
        updatedAt: null,
        customWorkouts: {},
        customRestDays: {},
        customWorkoutDays: {},
        completions: {}
      };

      if (!raw || typeof raw !== "object") {
        return normalized;
      }

      if (Number.isInteger(raw.day)) {
        normalized.day = Math.max(1, Math.min(TOTAL_DAYS, raw.day));
      }

      if (typeof raw.updatedAt === "string") {
        normalized.updatedAt = raw.updatedAt;
      }

      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const restValue = raw.customRestDays && (raw.customRestDays[day] || raw.customRestDays[String(day)]);
        if (restValue === true) {
          normalized.customRestDays[day] = true;
        }
      }

      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const workoutValue = raw.customWorkoutDays && (raw.customWorkoutDays[day] || raw.customWorkoutDays[String(day)]);
        if (workoutValue === true) {
          normalized.customWorkoutDays[day] = true;
        }
      }

      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const source = raw.customWorkouts && (raw.customWorkouts[day] || raw.customWorkouts[String(day)]);
        const custom = sanitizeCustomWorkout(day, source, Boolean(normalized.customWorkoutDays[day]));
        if (custom && !normalized.customRestDays[day]) {
          normalized.customWorkouts[day] = custom;
        }
      }

      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const source = raw.completions && (raw.completions[day] || raw.completions[String(day)]);
        const max = normalized.customWorkouts[day]
          ? normalized.customWorkouts[day].exercises.length - 1
          : (normalized.customRestDays[day] ? -1 : (getWorkout(day).exercises ? getWorkout(day).exercises.length - 1 : -1));
        normalized.completions[day] = normalizeCompletions(source || [], day, max);
      }

      return normalized;
    }

    function updateLastSavedUI() {
      if (!progressState || !progressState.updatedAt) {
        lastSavedText.textContent = "Last saved: -";
        return;
      }

      const when = new Date(progressState.updatedAt);
      if (Number.isNaN(when.getTime())) {
        lastSavedText.textContent = "Last saved: -";
        return;
      }

      lastSavedText.textContent = `Last saved: ${when.toLocaleString()}`;
    }

    function persistProgressState() {
      progressState.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(progressState));
      updateLastSavedUI();
    }

    function migrateLegacyProgress() {
      const state = safeParse(localStorage.getItem(STORAGE_STATE), null);
      const migrated = {
        version: 1,
        day: state && Number.isInteger(state.day) ? Math.max(1, Math.min(TOTAL_DAYS, state.day)) : null,
        updatedAt: null,
        customWorkouts: {},
        customRestDays: {},
        customWorkoutDays: {},
        completions: {}
      };

      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const legacy = safeParse(localStorage.getItem(`completions_${day}`), []);
        migrated.completions[day] = normalizeCompletions(legacy, day);
      }

      return migrated;
    }

    function loadProgressStore() {
      const raw = safeParse(localStorage.getItem(STORAGE_PROGRESS), null);
      if (raw && typeof raw === "object") {
        progressState = normalizeProgressState(raw);
      } else {
        progressState = migrateLegacyProgress();
      }

      persistProgressState();
    }

    function getStartDate() {
      const saved = localStorage.getItem(STORAGE_START);
      if (saved) {
        return new Date(saved + "T00:00:00");
      }
      const today = new Date();
      const iso = today.toISOString().slice(0, 10);
      localStorage.setItem(STORAGE_START, iso);
      return new Date(iso + "T00:00:00");
    }

    function getCompletions(day = currentDay) {
      if (!progressState) {
        loadProgressStore();
      }
      return progressState.completions[day] || [];
    }

    function setCompletions(day, completions) {
      if (!progressState) {
        loadProgressStore();
      }

      const workout = getWorkoutForDay(day);
      const max = workout.exercises ? workout.exercises.length - 1 : -1;
      progressState.completions[day] = normalizeCompletions(completions, day, max);
      persistProgressState();
    }

    function saveState() {
      if (!progressState) {
        loadProgressStore();
      }

      progressState.day = Math.max(1, Math.min(TOTAL_DAYS, currentDay));
      persistProgressState();
    }

    function hasAnyRecordedProgress() {
      if (!progressState) {
        return false;
      }

      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const completions = progressState.completions && progressState.completions[day];
        if (Array.isArray(completions) && completions.length > 0) {
          return true;
        }
      }

      return false;
    }

    function loadState() {
      if (!progressState) {
        loadProgressStore();
      }

      if (hasAnyRecordedProgress() && Number.isInteger(progressState.day)) {
        currentDay = Math.max(1, Math.min(TOTAL_DAYS, progressState.day));
        return;
      }

      const startDate = getStartDate();
      const now = new Date();
      const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayDiff = Math.floor((nowMidnight - startDate) / 86400000);
      currentDay = Math.max(1, Math.min(TOTAL_DAYS, dayDiff + 1));
      saveState();
    }

    function formatCalendarDate(day) {
      const startDate = getStartDate();
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + day - 1);
      return date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    }

    function getWorkout(day) {
      const week = Math.min(4, Math.ceil(day / 7));
      const baseDay = ((day - 1) % 7) + 1;

      if (baseDay === 2) {
        return { type: "Rest", message: week === 1 ? "Light activity: walk or stretch for 20 minutes." : "Mobility and recovery only." };
      }

      if (baseDay === 4 || baseDay === 7) {
        return { type: "Rest", message: "Full rest day. Prioritize sleep, hydration, and protein." };
      }

      const rounds = week === 1 ? 3 : week <= 3 ? 4 : 5;
      const coreMove = week <= 2
        ? { name: "Hanging Knee Raises", reps: week === 1 ? "10" : "12" }
        : { name: "Hanging Leg Raises", reps: week === 3 ? "15" : "15-20" };

      const workout = {
        type: baseDay === 6 ? "Optional" : "Workout",
        rounds,
        exercises: [
          { name: "Pull-Ups", reps: week === 1 ? "5" : week === 2 ? "6-8" : week === 3 ? "8-10" : "10-12" },
          { name: "Push-Ups", reps: week === 1 ? "10" : week === 2 ? "12-15" : week === 3 ? "15-20" : "20-25" },
          { name: "Squats", reps: week === 1 ? "15" : week === 2 ? "20" : week === 3 ? "25" : "30" },
          coreMove,
          { name: "Lunges", reps: week === 1 ? "10/leg" : week === 2 ? "12/leg" : "15/leg" },
          { name: "Plank", reps: week === 1 ? "30s" : week === 2 ? "40s" : week === 3 ? "45-60s" : "60-75s" }
        ],
        message: baseDay === 6 ? "Optional session, or swap with low-intensity cardio." : ""
      };

      return workout;
    }

    function buildWorkoutForRestOverride(day) {
      const week = Math.min(4, Math.ceil(day / 7));
      const rounds = week === 1 ? 3 : week <= 3 ? 4 : 5;
      const coreMove = week <= 2
        ? { name: "Hanging Knee Raises", reps: week === 1 ? "10" : "12" }
        : { name: "Hanging Leg Raises", reps: week === 3 ? "15" : "15-20" };

      return {
        type: "Workout",
        rounds,
        exercises: [
          { name: "Pull-Ups", reps: week === 1 ? "5" : week === 2 ? "6-8" : week === 3 ? "8-10" : "10-12" },
          { name: "Push-Ups", reps: week === 1 ? "10" : week === 2 ? "12-15" : week === 3 ? "15-20" : "20-25" },
          { name: "Squats", reps: week === 1 ? "15" : week === 2 ? "20" : week === 3 ? "25" : "30" },
          coreMove,
          { name: "Lunges", reps: week === 1 ? "10/leg" : week === 2 ? "12/leg" : "15/leg" },
          { name: "Plank", reps: week === 1 ? "30s" : week === 2 ? "40s" : week === 3 ? "45-60s" : "60-75s" }
        ],
        message: "Custom workout day enabled for this originally scheduled rest day."
      };
    }

    function sanitizeText(value, maxLen) {
      if (typeof value !== "string") {
        return "";
      }
      return value.trim().replace(/\s+/g, " ").slice(0, maxLen);
    }

    function sanitizeCustomWorkout(day, raw, allowOnRest = false) {
      const base = getWorkout(day);
      if (!raw || typeof raw !== "object" || (base.type === "Rest" && !allowOnRest)) {
        return null;
      }

      const roundsRaw = Number(raw.rounds);
      const fallbackRounds = base.type === "Rest" ? 3 : base.rounds;
      const rounds = Number.isFinite(roundsRaw) ? Math.max(1, Math.min(12, Math.round(roundsRaw))) : fallbackRounds;

      const incoming = Array.isArray(raw.exercises) ? raw.exercises : [];
      const cleanExercises = incoming
        .map((ex) => {
          if (!ex || typeof ex !== "object") {
            return null;
          }
          const name = sanitizeText(ex.name, 40);
          const reps = sanitizeText(ex.reps, 28);
          if (!name || !reps) {
            return null;
          }
          return { name, reps };
        })
        .filter(Boolean)
        .slice(0, 12);

      if (!cleanExercises.length) {
        return null;
      }

      return {
        rounds,
        exercises: cleanExercises
      };
    }

    function getWorkoutForDay(day) {
      const base = getWorkout(day);

      if (progressState && progressState.customRestDays && progressState.customRestDays[day]) {
        return {
          type: "Rest",
          message: "Just rest for the day. Recover, hydrate, and stretch.",
          isCustomized: true
        };
      }

      if (progressState && progressState.customWorkoutDays && progressState.customWorkoutDays[day] && base.type === "Rest") {
        const restOverride = buildWorkoutForRestOverride(day);
        const customOverride = progressState.customWorkouts ? progressState.customWorkouts[day] : null;

        if (customOverride) {
          return {
            ...restOverride,
            rounds: customOverride.rounds,
            exercises: customOverride.exercises.map((ex) => ({ ...ex })),
            isCustomized: true
          };
        }

        return {
          ...restOverride,
          isCustomized: true
        };
      }

      const custom = progressState && progressState.customWorkouts ? progressState.customWorkouts[day] : null;

      if (custom && base.type !== "Rest") {
        return {
          ...base,
          rounds: custom.rounds,
          exercises: custom.exercises.map((ex) => ({ ...ex })),
          isCustomized: true
        };
      }

      return {
        ...base,
        isCustomized: false
      };
    }

    function ensureDraftForDay(day) {
      const workout = getWorkoutForDay(day);
      customDraftByDay[day] = {
        rounds: workout.rounds,
        exercises: (workout.exercises || []).map((ex) => ({ ...ex }))
      };
    }

    function hasCustomWorkout(day) {
      return Boolean(progressState && progressState.customWorkouts && progressState.customWorkouts[day]);
    }

    function removeCustomWorkout(day) {
      if (!progressState || !progressState.customWorkouts[day]) {
        return;
      }

      delete progressState.customWorkouts[day];
      const baseWorkout = getWorkout(day);
      const max = baseWorkout.exercises ? baseWorkout.exercises.length : 0;
      const current = getCompletions(day).filter((idx) => idx < max);
      progressState.completions[day] = current;
      persistProgressState();
    }

    function setCustomRestDay(day, isRest) {
      if (!progressState || day < 1 || day > TOTAL_DAYS) {
        return;
      }

      if (isRest) {
        progressState.customRestDays[day] = true;
        delete progressState.customWorkoutDays[day];
        delete progressState.customWorkouts[day];
        progressState.completions[day] = [];
      } else {
        delete progressState.customRestDays[day];
        const base = getWorkout(day);
        if (base.type === "Rest") {
          progressState.customWorkoutDays[day] = true;
        } else {
          delete progressState.customWorkoutDays[day];
        }
        const effective = getWorkoutForDay(day);
        const max = effective.exercises ? effective.exercises.length - 1 : -1;
        progressState.completions[day] = normalizeCompletions(progressState.completions[day] || [], day, max);
      }

      persistProgressState();
    }

    function updateRestDayControls() {
      if (!setRestDayBtn || !setWorkoutDayBtn || !restPickedDayText) {
        return;
      }

      const isRest = getWorkoutForDay(currentDay).type === "Rest";
      restPickedDayText.textContent = `Selected day: Day ${currentDay}`;
      setRestDayBtn.disabled = isRest;
      setWorkoutDayBtn.disabled = !isRest;
    }

    function syncDraftFromForm(day) {
      const draft = customDraftByDay[day];
      if (!draft) {
        return;
      }

      const roundsInput = document.getElementById("customRounds");
      const rounds = roundsInput ? Number(roundsInput.value) : draft.rounds;
      draft.rounds = Number.isFinite(rounds) ? Math.max(1, Math.min(12, Math.round(rounds))) : draft.rounds;

      const rows = Array.from(document.querySelectorAll(".custom-row"));
      draft.exercises = rows.map((row) => {
        const nameInput = row.querySelector(".custom-name");
        const repsInput = row.querySelector(".custom-reps");
        return {
          name: sanitizeText(nameInput ? nameInput.value : "", 40),
          reps: sanitizeText(repsInput ? repsInput.value : "", 28)
        };
      });
    }

    function saveDraftWorkout(day) {
      syncDraftFromForm(day);
      const draft = customDraftByDay[day];
      const clean = sanitizeCustomWorkout(day, draft);

      if (!clean) {
        setStatus("Please provide at least one valid exercise with reps.");
        return;
      }

      progressState.customWorkouts[day] = clean;
      const clipped = getCompletions(day).filter((idx) => idx < clean.exercises.length);
      progressState.completions[day] = clipped;
      persistProgressState();
      setStatus(`Custom workout saved for Day ${day}.`);
      customizeOpenDay = null;
      delete customDraftByDay[day];
      render();
    }

    function addDraftExercise(day) {
      syncDraftFromForm(day);
      const draft = customDraftByDay[day];
      if (!draft) {
        return;
      }

      if (draft.exercises.length >= 12) {
        setStatus("Maximum 12 exercises per custom workout.");
        return;
      }

      draft.exercises.push({ name: "New Exercise", reps: "10" });
      render();
    }

    function removeDraftExercise(day, index) {
      syncDraftFromForm(day);
      const draft = customDraftByDay[day];
      if (!draft) {
        return;
      }

      if (draft.exercises.length <= 1) {
        setStatus("At least one exercise is required.");
        return;
      }

      draft.exercises.splice(index, 1);
      render();
    }

    function toggleCustomizeEditor(day) {
      if (customizeOpenDay === day) {
        customizeOpenDay = null;
        delete customDraftByDay[day];
      } else {
        customizeOpenDay = day;
        ensureDraftForDay(day);
      }
      render();
    }

    function isRestDay(day) {
      const workout = getWorkoutForDay(day);
      return workout.type === "Rest";
    }

    function isDayCompleted(day) {
      const workout = getWorkoutForDay(day);
      if (!workout.exercises) {
        return false;
      }
      return getCompletions(day).length >= workout.exercises.length;
    }

    function shortType(type) {
      if (type === "Workout") return "💪";
      if (type === "Optional") return "Optional";
      return "🛏️";
    }

    function percent(done, total) {
      return total === 0 ? 0 : Math.round((done / total) * 100);
    }

    function updateProgress() {
      const todayWorkout = getWorkoutForDay(currentDay);
      const todayDone = getCompletions(currentDay).length;
      const todayTotal = todayWorkout.exercises ? todayWorkout.exercises.length : 0;

      let completedAllDays = 0;
      let totalAllDays = 0;

      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const workout = getWorkoutForDay(day);
        const total = workout.exercises ? workout.exercises.length : 0;
        const done = Math.min(getCompletions(day).length, total);
        totalAllDays += total;
        completedAllDays += done;
      }

      const overallPercent = percent(completedAllDays, totalAllDays);
      const dayPercent = percent(todayDone, todayTotal);

      document.getElementById("progressPercent").textContent = `${overallPercent}%`;
      document.getElementById("dayPercent").textContent = `${dayPercent}%`;
      document.getElementById("completedCount").textContent = `${completedAllDays} / ${totalAllDays}`;
      document.getElementById("progressFill").style.width = `${overallPercent}%`;
      document.getElementById("progressText").textContent =
        todayTotal === 0
          ? `Day ${currentDay} is a recovery day. Stay active and recover well.`
          : `Day ${currentDay}: ${todayDone} of ${todayTotal} exercises checked.`;
    }

    function toClock(seconds) {
      const m = String(Math.floor(seconds / 60)).padStart(2, "0");
      const s = String(seconds % 60).padStart(2, "0");
      return `${m}:${s}`;
    }

    function stopTimer() {
      if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
      }
    }

    function supportsNotification() {
      return typeof window !== "undefined" && "Notification" in window;
    }

    function shouldNotify() {
      return localStorage.getItem(STORAGE_NOTIFY) === "1";
    }

    async function requestNotificationPermission() {
      if (!supportsNotification()) {
        setStatus("Browser notifications are not supported here.");
        notifyToggle.checked = false;
        localStorage.setItem(STORAGE_NOTIFY, "0");
        return;
      }

      if (Notification.permission === "granted") {
        localStorage.setItem(STORAGE_NOTIFY, "1");
        setStatus("Timer notifications are enabled.");
        return;
      }

      const permission = await Notification.requestPermission();
      const allowed = permission === "granted";
      localStorage.setItem(STORAGE_NOTIFY, allowed ? "1" : "0");
      notifyToggle.checked = allowed;
      setStatus(allowed ? "Timer notifications are enabled." : "Notification permission was not granted.");
    }

    function playTimerEndSound() {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;

        const toneA = audioCtx.createOscillator();
        const toneB = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        toneA.type = "triangle";
        toneB.type = "sine";
        toneA.frequency.setValueAtTime(740, now);
        toneB.frequency.setValueAtTime(988, now + 0.12);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        toneA.connect(gain);
        toneB.connect(gain);
        gain.connect(audioCtx.destination);

        toneA.start(now);
        toneB.start(now + 0.12);
        toneA.stop(now + 0.35);
        toneB.stop(now + 0.45);
      } catch (_) {
        setStatus("Could not play timer sound in this browser session.");
      }
    }

    function notifyTimerFinished() {
      playTimerEndSound();
      if (shouldNotify() && supportsNotification() && Notification.permission === "granted") {
        const body = `Day ${currentDay}: Rest interval complete. Start your next set.`;
        new Notification("Workout Timer Complete", { body });
      }
    }

    function setStatus(message) {
      syncStatus.textContent = message;
    }

    function exportProgress() {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        setStatus("PDF export is unavailable right now. Please refresh and try again.");
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const stamp = new Date().toISOString().slice(0, 10);
      const generatedAt = new Date().toLocaleString();

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);
      let y = margin;

      function newPageIfNeeded(extra = 20) {
        if (y + extra > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      }

      function writeLine(text, size = 11, gap = 16, style = "normal") {
        newPageIfNeeded(gap + 8);
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        const wrapped = doc.splitTextToSize(String(text), contentWidth);
        doc.text(wrapped, margin, y);
        y += Math.max(gap, wrapped.length * (size + 3));
      }

      let completedAllDays = 0;
      let totalAllDays = 0;

      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const workout = getWorkoutForDay(day);
        const total = workout.exercises ? workout.exercises.length : 0;
        const done = Math.min(getCompletions(day).length, total);
        totalAllDays += total;
        completedAllDays += done;
      }

      const overallPercent = percent(completedAllDays, totalAllDays);

      writeLine("30-Day Workout Scheduler Progress Report", 18, 24, "bold");
      writeLine(`Generated: ${generatedAt}`, 10, 14);
      writeLine(`Program day: Day ${currentDay} of ${TOTAL_DAYS}`, 11, 14);
      writeLine(`Overall progress: ${completedAllDays} / ${totalAllDays} (${overallPercent}%)`, 11, 20);

      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const workout = getWorkoutForDay(day);
        const completions = getCompletions(day);
        const total = workout.exercises ? workout.exercises.length : 0;
        const done = Math.min(completions.length, total);
        const dayPct = percent(done, total);

        writeLine(`Day ${day} - ${workout.type}`, 12, 16, "bold");

        if (!workout.exercises || !workout.exercises.length) {
          writeLine(`Rest day. ${workout.message || "Recovery only."}`, 10, 14);
          y += 4;
          continue;
        }

        writeLine(`Rounds: ${workout.rounds} | Completed: ${done}/${total} (${dayPct}%)`, 10, 14);

        workout.exercises.forEach((exercise, index) => {
          const checked = completions.includes(index) ? "[x]" : "[ ]";
          writeLine(`${checked} ${exercise.name} - ${exercise.reps} per round`, 10, 13);
        });

        if (workout.message) {
          writeLine(`Note: ${workout.message}`, 10, 13);
        }

        y += 6;
      }

      doc.save(`workout-progress-${stamp}.pdf`);
      setStatus("Progress exported as PDF.");
    }

    function importProgress(file) {
      const reader = new FileReader();
      reader.onload = () => {
        const data = safeParse(reader.result, null);
        if (!data || typeof data !== "object" || !data.completions) {
          setStatus("Import failed: invalid JSON structure.");
          return;
        }

        progressState.customWorkouts = {};
        progressState.customRestDays = {};
        progressState.customWorkoutDays = {};

        if (data.customRestDays && typeof data.customRestDays === "object") {
          for (let day = 1; day <= TOTAL_DAYS; day += 1) {
            const restValue = data.customRestDays[day] || data.customRestDays[String(day)];
            if (restValue === true) {
              progressState.customRestDays[day] = true;
            }
          }
        }

        if (data.customWorkoutDays && typeof data.customWorkoutDays === "object") {
          for (let day = 1; day <= TOTAL_DAYS; day += 1) {
            const workoutValue = data.customWorkoutDays[day] || data.customWorkoutDays[String(day)];
            if (workoutValue === true && !progressState.customRestDays[day]) {
              progressState.customWorkoutDays[day] = true;
            }
          }
        }

        if (data.customWorkouts && typeof data.customWorkouts === "object") {
          for (let day = 1; day <= TOTAL_DAYS; day += 1) {
            const incoming = data.customWorkouts[day] || data.customWorkouts[String(day)];
            const custom = sanitizeCustomWorkout(day, incoming, Boolean(progressState.customWorkoutDays[day]));
            if (custom && !progressState.customRestDays[day]) {
              progressState.customWorkouts[day] = custom;
            }
          }
        }

        for (let day = 1; day <= TOTAL_DAYS; day += 1) {
          const raw = data.completions[day] || data.completions[String(day)] || [];
          const cleaned = Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n) && n >= 0) : [];
          setCompletions(day, cleaned);
        }

        if (data.startDate && typeof data.startDate === "string") {
          localStorage.setItem(STORAGE_START, data.startDate);
        }

        if (data.theme === "light" || data.theme === "dark") {
          applyTheme(data.theme);
        }

        if (data.state && Number.isInteger(data.state.day)) {
          currentDay = Math.max(1, Math.min(TOTAL_DAYS, data.state.day));
          saveState();
        }

        if (typeof data.notificationsEnabled === "boolean") {
          localStorage.setItem(STORAGE_NOTIFY, data.notificationsEnabled ? "1" : "0");
          notifyToggle.checked = data.notificationsEnabled;
        }

        setStatus("Progress imported successfully.");
        render();
      };

      reader.onerror = () => {
        setStatus("Import failed: could not read file.");
      };

      reader.readAsText(file);
    }

    function renderCalendar() {
      let html = "";
      for (let day = 1; day <= TOTAL_DAYS; day += 1) {
        const workout = getWorkoutForDay(day);
        const classes = ["day-chip"];
        if (day === currentDay) classes.push("current");
        if (isDayCompleted(day)) classes.push("completed");
        if (isRestDay(day)) classes.push("rest");

        html += `
          <button type="button" class="${classes.join(" ")}" data-day="${day}" aria-label="Go to day ${day}">
            <span class="chip-day">Day ${day}</span>
            <span class="chip-type">${shortType(workout.type)}</span>
          </button>
        `;
      }

      calendarGrid.innerHTML = html;
      const chips = calendarGrid.querySelectorAll(".day-chip");
      chips.forEach((chip) => {
        chip.addEventListener("click", (event) => {
          const day = Number(event.currentTarget.dataset.day);
          if (!Number.isNaN(day)) {
            currentDay = day;
            saveState();
            render();
          }
        });
      });
    }

    function resetTimer() {
      stopTimer();
      timerRemaining = REST_SECONDS;
      render();
    }

    function toggleTimer() {
      if (timerIntervalId) {
        stopTimer();
        render();
        return;
      }

      timerIntervalId = setInterval(() => {
        timerRemaining -= 1;
        if (timerRemaining <= 0) {
          timerRemaining = 0;
          stopTimer();
          notifyTimerFinished();
        }
        render();
      }, 1000);

      render();
    }

    function toggleComplete(index) {
      const completions = getCompletions(currentDay);
      const existing = completions.indexOf(index);
      if (existing > -1) {
        completions.splice(existing, 1);
      } else {
        completions.push(index);
      }
      setCompletions(currentDay, completions);
      saveState();
      render();
    }

    function renderWorkoutCard(workout) {
      if (workout.type === "Rest") {
        return `
          <article class="day-card">
            <header class="day-head">
              <h2 class="day-title">Day ${currentDay}: Recovery Focus</h2>
              <span class="badge status-rest">Rest</span>
            </header>
            <p class="helper">${workout.message || "Take a complete rest day and come back stronger tomorrow."}</p>
          </article>
        `;
      }

      const completions = getCompletions(currentDay);
      const statusClass = workout.type === "Optional" ? "status-optional" : "status-workout";
      const title = workout.type === "Optional" ? "Optional Training" : "Workout Day";
      const openEditor = customizeOpenDay === currentDay;
      const draft = customDraftByDay[currentDay];
      const editorRows = openEditor && draft
        ? draft.exercises.map((exercise, index) => `
            <div class="custom-row">
              <input class="custom-input custom-name" type="text" maxlength="40" value="${exercise.name.replace(/"/g, "&quot;")}" placeholder="Exercise name">
              <input class="custom-input custom-reps" type="text" maxlength="28" value="${exercise.reps.replace(/"/g, "&quot;")}" placeholder="Reps / time">
              <button class="mini-btn danger remove-exercise-btn" type="button" data-remove-index="${index}">Remove</button>
            </div>
          `).join("")
        : "";

      const items = workout.exercises.map((exercise, index) => {
        const isChecked = completions.includes(index);
        return `
          <li class="exercise ${isChecked ? "completed" : ""}">
            <span class="exercise-index">${index + 1}</span>
            <div>
              <div class="exercise-name">${exercise.name}</div>
              <div class="exercise-spec">${exercise.reps} per round</div>
            </div>
            <input class="check" type="checkbox" ${isChecked ? "checked" : ""} data-index="${index}" aria-label="Mark ${exercise.name} complete">
          </li>
        `;
      }).join("");

      return `
        <article class="day-card">
          <header class="day-head">
            <h2 class="day-title">Day ${currentDay}: ${title}</h2>
            <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
              <span class="badge ${statusClass}">${workout.type}</span>
              ${workout.isCustomized ? '<span class="badge badge-custom">Customized</span>' : ""}
            </div>
          </header>

          <p class="rounds">${workout.rounds} rounds, rest 60-90 seconds between exercises.</p>
          <ul class="exercise-list">${items}</ul>

          ${workout.message ? `<p class="helper">${workout.message}</p>` : ""}

          <section class="timer" aria-label="Rest Timer">
            <div class="timer-row">
              <strong>Rest Timer</strong>
              <span class="timer-value">${toClock(timerRemaining)}</span>
            </div>
            <div class="timer-actions">
              <button class="btn" type="button" id="timerToggleBtn">${timerIntervalId ? "Pause" : timerRemaining === REST_SECONDS ? "Start 90s" : "Resume"}</button>
              <button class="btn secondary" type="button" id="timerResetBtn">Reset</button>
            </div>
          </section>

          <section class="custom-wrap" aria-label="Customize Workout">
            <div class="custom-meta">Customize this day and save locally without login.</div>
            <div class="custom-actions">
              <button class="mini-btn" type="button" id="toggleCustomizeBtn">${openEditor ? "Close Editor" : "Customize Workout"}</button>
              ${hasCustomWorkout(currentDay) ? '<button class="mini-btn danger" type="button" id="resetCustomizeBtn">Reset to Program</button>' : ""}
            </div>

            ${openEditor ? `
              <div class="custom-editor" id="customEditor">
                <label class="custom-meta" for="customRounds">Rounds</label>
                <input id="customRounds" class="custom-input" type="number" min="1" max="12" value="${draft.rounds}">
                <div class="custom-actions">
                  <button class="mini-btn" type="button" id="addExerciseBtn">Add Exercise</button>
                </div>
                ${editorRows}
                <div class="custom-actions">
                  <button class="btn" type="button" id="saveCustomizeBtn">Save Custom Workout</button>
                  <button class="mini-btn" type="button" id="cancelCustomizeBtn">Cancel</button>
                </div>
              </div>
            ` : ""}
          </section>
        </article>
      `;
    }

    function render() {
      const workout = getWorkoutForDay(currentDay);

      document.getElementById("programDayLabel").textContent = `Day ${currentDay} of ${TOTAL_DAYS}`;
      document.getElementById("currentDate").textContent = formatCalendarDate(currentDay);

      prevBtn.disabled = currentDay <= 1;
      nextBtn.disabled = currentDay >= TOTAL_DAYS;

      workoutContent.innerHTML = renderWorkoutCard(workout);
      updateProgress();
      renderCalendar();
      updateRestDayControls();
      applyMobileTabLayout();

      const checks = workoutContent.querySelectorAll(".check");
      checks.forEach((checkbox) => {
        checkbox.addEventListener("change", (event) => {
          const index = Number(event.target.dataset.index);
          if (!Number.isNaN(index)) {
            toggleComplete(index);
          }
        });
      });

      const timerToggleBtn = document.getElementById("timerToggleBtn");
      const timerResetBtn = document.getElementById("timerResetBtn");
      const toggleCustomizeBtn = document.getElementById("toggleCustomizeBtn");
      const resetCustomizeBtn = document.getElementById("resetCustomizeBtn");
      const addExerciseBtn = document.getElementById("addExerciseBtn");
      const saveCustomizeBtn = document.getElementById("saveCustomizeBtn");
      const cancelCustomizeBtn = document.getElementById("cancelCustomizeBtn");
      const removeExerciseBtns = workoutContent.querySelectorAll(".remove-exercise-btn");

      if (timerToggleBtn) {
        timerToggleBtn.addEventListener("click", toggleTimer);
      }

      if (timerResetBtn) {
        timerResetBtn.addEventListener("click", resetTimer);
      }

      if (toggleCustomizeBtn) {
        toggleCustomizeBtn.addEventListener("click", () => toggleCustomizeEditor(currentDay));
      }

      if (resetCustomizeBtn) {
        resetCustomizeBtn.addEventListener("click", () => {
          removeCustomWorkout(currentDay);
          customizeOpenDay = null;
          delete customDraftByDay[currentDay];
          setStatus(`Workout reset to program defaults for Day ${currentDay}.`);
          render();
        });
      }

      if (addExerciseBtn) {
        addExerciseBtn.addEventListener("click", () => addDraftExercise(currentDay));
      }

      removeExerciseBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const index = Number(btn.dataset.removeIndex);
          if (!Number.isNaN(index)) {
            removeDraftExercise(currentDay, index);
          }
        });
      });

      if (saveCustomizeBtn) {
        saveCustomizeBtn.addEventListener("click", () => saveDraftWorkout(currentDay));
      }

      if (cancelCustomizeBtn) {
        cancelCustomizeBtn.addEventListener("click", () => {
          customizeOpenDay = null;
          delete customDraftByDay[currentDay];
          render();
        });
      }
    }

    notifyToggle.checked = shouldNotify();

    notifyToggle.addEventListener("change", async () => {
      if (notifyToggle.checked) {
        await requestNotificationPermission();
      } else {
        localStorage.setItem(STORAGE_NOTIFY, "0");
        setStatus("Timer notifications are disabled.");
      }
    });

    exportBtn.addEventListener("click", exportProgress);

    themeToggleBtn.addEventListener("click", toggleTheme);

    importBtn.addEventListener("click", () => {
      importFile.click();
    });

    setRestDayBtn.addEventListener("click", () => {
      setCustomRestDay(currentDay, true);
      customizeOpenDay = null;
      delete customDraftByDay[currentDay];
      setStatus(`Day ${currentDay} saved as a custom rest day.`);
      render();
    });

    setWorkoutDayBtn.addEventListener("click", () => {
      const wasRest = getWorkoutForDay(currentDay).type === "Rest";
      setCustomRestDay(currentDay, false);
      if (wasRest && getWorkout(currentDay).type === "Rest") {
        setStatus(`Day ${currentDay} is now a custom workout day.`);
      } else {
        setStatus(`Day ${currentDay} restored to program schedule.`);
      }
      render();
    });

    mobileTabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        setMobileTab(btn.dataset.tab);
      });
    });

    mobileMq.addEventListener("change", applyMobileTabLayout);

    importFile.addEventListener("change", (event) => {
      const [file] = event.target.files || [];
      if (file) {
        importProgress(file);
      }
      event.target.value = "";
    });

    prevBtn.addEventListener("click", () => {
      if (currentDay > 1) {
        currentDay -= 1;
        saveState();
        render();
      }
    });

    nextBtn.addEventListener("click", () => {
      if (currentDay < TOTAL_DAYS) {
        currentDay += 1;
        saveState();
        render();
      }
    });

    loadState();
    applyTheme(getPreferredTheme());
    render();
