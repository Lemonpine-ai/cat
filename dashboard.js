import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// 다보냥 — 프로덕션: https://lemonpine-ai.github.io/cat/ — Supabase Auth Site URL·Redirect URLs (README 참고)

const SUPABASE_PROJECT_URL = 'https://nqcipfozkdedklqnkzju.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xY2lwZm96a2RlZGtscW5remp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNTk4MDcsImV4cCI6MjA4OTkzNTgwN30.Zh-f9lWT5K48RP7PRN3_44-bNnjJ9nRFB3Nr3QymTX0';

const supabaseBrowserClient = createClient(SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    storage: window.localStorage,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

const githubLoginButton = document.getElementById('githubLoginButton');
const logoutButton = document.getElementById('logoutButton');
const refreshReportsButton = document.getElementById('refreshReportsButton');
const refreshCommunityButton = document.getElementById('refreshCommunityButton');
const catReportGrid = document.getElementById('catReportGrid');
const emptyState = document.getElementById('emptyState');
const statusMessage = document.getElementById('statusMessage');
const sessionSummary = document.getElementById('sessionSummary');
const authNotice = document.getElementById('authNotice');
const realtimeStatus = document.getElementById('realtimeStatus');

const communityStatusMessage = document.getElementById('communityStatusMessage');
const communityPostList = document.getElementById('communityPostList');
const communityEmptyState = document.getElementById('communityEmptyState');
const communityComposer = document.getElementById('communityComposer');
const communityPostForm = document.getElementById('communityPostForm');
const communityPostTitle = document.getElementById('communityPostTitle');
const communityPostTopic = document.getElementById('communityPostTopic');
const communityPostBody = document.getElementById('communityPostBody');
const communityTopicFilters = document.getElementById('communityTopicFilters');
const communityPostSubmitButton = document.getElementById('communityPostSubmitButton');
const accountSessionDetail = document.getElementById('accountSessionDetail');

const splashScreen = document.getElementById('splashScreen');
const loginScreen = document.getElementById('loginScreen');
const appShell = document.getElementById('appShell');
const splashStartButton = document.getElementById('splashStartButton');
const splashSkipButton = document.getElementById('splashSkipButton');
const showSplashAgainButton = document.getElementById('showSplashAgainButton');
const loginPasswordForm = document.getElementById('loginPasswordForm');
const loginEmailInput = document.getElementById('loginEmailInput');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const loginSubmitButton = document.getElementById('loginSubmitButton');
const loginGoogleButton = document.getElementById('loginGoogleButton');
const loginKakaoButton = document.getElementById('loginKakaoButton');
const loginFormMessage = document.getElementById('loginFormMessage');
const loginBackButton = document.getElementById('loginBackButton');

/** 스플래시에서 「시작하기」로 로그인 화면을 연 뒤 새로고침·OAuth 복귀 시 상태 복원용 */
const LOGIN_SCREEN_SESSION_KEY = 'dabonyang_show_login_screen';
const homeScreenTitleText = document.getElementById('homeScreenTitleText');
const homeManagedCatsCount = document.getElementById('homeManagedCatsCount');
const homeCatAvatarRow = document.getElementById('homeCatAvatarRow');
const homeLiveChannelCount = document.getElementById('homeLiveChannelCount');
const homeFeedingStatsCols = document.getElementById('homeFeedingStatsCols');
const homeToiletStatsCols = document.getElementById('homeToiletStatsCols');
const homeMedicationPlaceholderRows = document.getElementById('homeMedicationPlaceholderRows');
const homeCareFabButton = document.getElementById('homeCareFabButton');
const homeTimelineList = document.getElementById('homeTimelineList');
const healthReportRangeTitle = document.getElementById('healthReportRangeTitle');
const healthReportRangeSub = document.getElementById('healthReportRangeSub');
const healthActivitySummary = document.getElementById('healthActivitySummary');
const healthPainSummary = document.getElementById('healthPainSummary');
const healthAiSummaryText = document.getElementById('healthAiSummaryText');
const accountProfileName = document.getElementById('accountProfileName');
const accountProfileSub = document.getElementById('accountProfileSub');

const homeCameraGrid = document.getElementById('homeCameraGrid');
const homeDashboardStatus = document.getElementById('homeDashboardStatus');
const envWaterLastRelative = document.getElementById('envWaterLastRelative');
const envLitterLastRelative = document.getElementById('envLitterLastRelative');
const environmentUpdateModal = document.getElementById('environmentUpdateModal');
const environmentLogForm = document.getElementById('environmentLogForm');
const environmentModalTitle = document.getElementById('environmentModalTitle');
const environmentModalDescription = document.getElementById('environmentModalDescription');
const environmentModalKindInput = document.getElementById('environmentModalKindInput');
const environmentModalNoteInput = document.getElementById('environmentModalNoteInput');
const environmentModalCancelButton = document.getElementById('environmentModalCancelButton');
const cameraDetailModal = document.getElementById('cameraDetailModal');
const cameraDetailTitle = document.getElementById('cameraDetailTitle');
const cameraDetailStatusLine = document.getElementById('cameraDetailStatusLine');
const cameraVoiceBroadcastButton = document.getElementById('cameraVoiceBroadcastButton');
const cameraDetailCloseButton = document.getElementById('cameraDetailCloseButton');

const panelHome = document.getElementById('panelHome');
const panelCommunity = document.getElementById('panelCommunity');
const panelHealth = document.getElementById('panelHealth');
const panelAccount = document.getElementById('panelAccount');
const mainTabButtons = document.querySelectorAll('[data-tab-target]');
// 구 screen-flow-nav 제거 후 빈 목록 유지 (mainTabButtons가 전담)
const screenFlowLinks = document.querySelectorAll('.screen-flow-link--legacy');

const themeToggleButton = document.getElementById('themeToggleButton');
const themeMenuToggle = document.getElementById('themeMenuToggle');
const themeMenuLabel = document.getElementById('themeMenuLabel');

let behaviorEventsRealtimeChannel = null;
let cachedAppUserProfileId = null;
/** @type {string | null} */
let cachedProfileHomeId = null;
/** @type {{ id: string, slug: string, label_ko: string, sort_order: number }[]} */
let cachedCommunityTopics = [];
/** @type {string | null} null이면 전체 글 */
let selectedCommunityTopicFilterId = null;

const MAIN_TAB_IDS = ['home', 'community', 'health', 'account'];

// ─── 테마 관리 ───────────────────────────────────────────
const THEME_STORAGE_KEY = 'dabonyang_theme';

function readCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

function applyThemeToDocument(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  const metaThemeColor = document.getElementById('metaThemeColor');
  if (metaThemeColor) {
    metaThemeColor.content = themeName === 'dark' ? '#0a0a0f' : '#ffffff';
  }
  if (themeMenuLabel) {
    themeMenuLabel.textContent = themeName === 'dark' ? '다크 모드' : '라이트 모드';
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeName);
  } catch {
    /* ignore */
  }
}

function toggleTheme() {
  const nextTheme = readCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyThemeToDocument(nextTheme);
}
// ─────────────────────────────────────────────────────────

/** OAuth 리다이렉트 URL (Supabase 대시보드에 동일한 URL을 Redirect URLs로 등록해야 합니다) */
function buildOAuthRedirectUrlForCurrentPage() {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

function setStatusMessage(text, isError = false) {
  if (!statusMessage) {
    return;
  }
  statusMessage.textContent = text;
  statusMessage.dataset.error = isError ? 'true' : 'false';
}

function setHomeDashboardStatus(text, isError = false) {
  if (!homeDashboardStatus) {
    return;
  }
  homeDashboardStatus.textContent = text;
  homeDashboardStatus.dataset.error = isError ? 'true' : 'false';
}

function setCommunityStatusMessage(text, isError = false) {
  communityStatusMessage.textContent = text;
  communityStatusMessage.dataset.error = isError ? 'true' : 'false';
}

function formatPainScoreDisplayValue(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return '—';
  }
  return Number(score).toFixed(1);
}

function formatTimestampDisplayValue(isoString) {
  if (!isoString) {
    return '—';
  }
  try {
    return new Date(isoString).toLocaleString('ko-KR');
  } catch {
    return String(isoString);
  }
}

function buildAvatarLetterFromLabel(rawLabel, fallbackLetter) {
  const trimmed = String(rawLabel ?? '').trim();
  if (!trimmed) {
    return fallbackLetter;
  }
  const firstCluster = trimmed[0];
  return firstCluster || fallbackLetter;
}

function renderCatReportCards(catReports) {
  if (!catReportGrid) {
    return;
  }
  catReportGrid.innerHTML = '';

  if (!catReports.length) {
    emptyState?.classList.remove('hidden');
    if (authNotice) {
      authNotice.hidden = false;
    }
    return;
  }

  emptyState?.classList.add('hidden');
  if (authNotice) {
    authNotice.hidden = true;
  }

  const fragment = document.createDocumentFragment();

  for (const report of catReports) {
    const card = document.createElement('article');
    card.className = 'cat-card';
    const avatarLetter = buildAvatarLetterFromLabel(report.cat_name, '🐱');
    card.innerHTML = `
      <div class="cat-card-inner">
        <div class="cat-card-row">
          <div class="cat-card-avatar" aria-hidden="true">${escapeHtml(avatarLetter)}</div>
          <header class="cat-card-header">
            <h2 class="cat-name">${escapeHtml(report.cat_name ?? '')}</h2>
            <span class="cat-meta">${escapeHtml([report.sex, report.breed].filter(Boolean).join(' · '))}</span>
          </header>
        </div>
        <dl class="cat-stats">
          <div class="stat">
            <dt>식사 (7일)</dt>
            <dd>${report.meals_7d ?? 0}</dd>
          </div>
          <div class="stat">
            <dt>화장실 (7일)</dt>
            <dd>${report.toilets_7d ?? 0}</dd>
          </div>
          <div class="stat">
            <dt>점프 합계 (7일)</dt>
            <dd>${report.jumps_7d ?? 0}</dd>
          </div>
          <div class="stat stat-highlight">
            <dt>평균 통증 점수 (7일)</dt>
            <dd>${formatPainScoreDisplayValue(report.avg_pain_score_7d)}</dd>
          </div>
        </dl>
        <footer class="cat-card-footer">
          <span>최근 이벤트</span>
          <time datetime="${report.last_event_time ?? ''}">${formatTimestampDisplayValue(report.last_event_time)}</time>
        </footer>
      </div>
    `;
    fragment.appendChild(card);
  }

  catReportGrid.appendChild(fragment);
}

function escapeHtml(rawText) {
  return String(rawText)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchCatReportsFromSupabase() {
  const { data, error } = await supabaseBrowserClient
    .from('cat_reports')
    .select(
      'cat_id, cat_name, sex, breed, meals_7d, toilets_7d, jumps_7d, avg_pain_score_7d, last_event_time',
    )
    .order('cat_name', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

function computeCatDisplayInitialFromName(catName) {
  const trimmedName = (catName ?? '').trim();
  if (!trimmedName) {
    return '?';
  }
  return trimmedName.slice(0, 1);
}

function renderHomeCatAvatarStripFromReports(catReports) {
  if (!homeCatAvatarRow) {
    return;
  }
  homeCatAvatarRow.innerHTML = '';
  if (!catReports.length) {
    const emptyHint = document.createElement('p');
    emptyHint.className = 'home-cat-avatar-empty';
    emptyHint.textContent = '로그인 후 건강 리포트에 고양이가 보이면 여기에 표시됩니다.';
    homeCatAvatarRow.appendChild(emptyHint);
    return;
  }
  const visibleReports = catReports.slice(0, 4);
  for (let reportIndex = 0; reportIndex < visibleReports.length; reportIndex += 1) {
    const reportRow = visibleReports[reportIndex];
    const pillWrapper = document.createElement('div');
    pillWrapper.className = `home-cat-avatar-pill${reportIndex === 0 ? ' is-active' : ''}`;
    pillWrapper.setAttribute('role', 'listitem');
    const avatarRing = document.createElement('div');
    avatarRing.className = 'home-cat-avatar-ring';
    avatarRing.textContent = computeCatDisplayInitialFromName(reportRow.cat_name);
    const nameLabel = document.createElement('span');
    nameLabel.className = 'home-cat-avatar-name';
    nameLabel.textContent = reportRow.cat_name?.trim() || '고양이';
    pillWrapper.appendChild(avatarRing);
    pillWrapper.appendChild(nameLabel);
    homeCatAvatarRow.appendChild(pillWrapper);
  }
}

function renderHomeMedicationPlaceholderRowsFromReports(catReports) {
  if (!homeMedicationPlaceholderRows) {
    return;
  }
  if (!catReports.length) {
    homeMedicationPlaceholderRows.innerHTML =
      '<div class="home-bento-med-row muted"><span>리포트 연동 후 표시됩니다</span></div>';
    return;
  }
  const firstCat = catReports[0];
  const secondCat = catReports[1];
  const firstName = escapeHtml(firstCat.cat_name?.trim() || '고양이');
  const rowHtmlParts = [
    `<div class="home-bento-med-row"><span><strong>${firstName}</strong> · 복약 알림은 준비 중입니다</span><span class="muted" style="font-size:0.8rem;">예정</span></div>`,
  ];
  if (secondCat) {
    const secondName = escapeHtml(secondCat.cat_name?.trim() || '고양이');
    rowHtmlParts.push(
      `<div class="home-bento-med-row muted"><span><strong>${secondName}</strong> · 복약 기록은 준비 중입니다</span><span style="font-size:0.8rem;">—</span></div>`,
    );
  }
  homeMedicationPlaceholderRows.innerHTML = rowHtmlParts.join('');
}

function buildHomeDualStatCellsHtml(catReports, numericFieldKey) {
  if (!catReports.length) {
    return (
      '<div class="home-bento-stat-cell"><span class="home-bento-stat-name">—</span><span class="home-bento-stat-num">—</span></div>' +
      '<div class="home-bento-stat-cell"><span class="home-bento-stat-name">—</span><span class="home-bento-stat-num">—</span></div>'
    );
  }
  const firstCat = catReports[0];
  const secondCat = catReports[1];
  const firstValue = firstCat[numericFieldKey] ?? 0;
  const firstCell =
    '<div class="home-bento-stat-cell">' +
    `<span class="home-bento-stat-name">${escapeHtml(firstCat.cat_name?.trim() || '고양이')}</span>` +
    `<span class="home-bento-stat-num">${escapeHtml(String(firstValue))}회</span>` +
    '</div>';
  const secondCell = secondCat
    ? '<div class="home-bento-stat-cell">' +
      `<span class="home-bento-stat-name">${escapeHtml(secondCat.cat_name?.trim() || '고양이')}</span>` +
      `<span class="home-bento-stat-num">${escapeHtml(String(secondCat[numericFieldKey] ?? 0))}회</span>` +
      '</div>'
    : '<div class="home-bento-stat-cell"><span class="home-bento-stat-name">—</span><span class="home-bento-stat-num">—</span></div>';
  return firstCell + secondCell;
}

function updateHomeLiveChannelBadgeFromDom() {
  if (!homeLiveChannelCount || !homeCameraGrid) {
    return;
  }
  const cameraTileNodeList = homeCameraGrid.querySelectorAll('.home-camera-tile');
  const channelCount = cameraTileNodeList.length;
  homeLiveChannelCount.textContent =
    channelCount > 0 ? `${channelCount}개 실시간 채널` : '채널 없음';
}

function updateHomeDashboardFromReports(catReports) {
  renderHomeCatAvatarStripFromReports(catReports);
  renderHomeMedicationPlaceholderRowsFromReports(catReports);
  if (homeFeedingStatsCols) {
    homeFeedingStatsCols.innerHTML = buildHomeDualStatCellsHtml(catReports, 'meals_7d');
  }
  if (homeToiletStatsCols) {
    homeToiletStatsCols.innerHTML = buildHomeDualStatCellsHtml(catReports, 'toilets_7d');
  }
  if (homeManagedCatsCount) {
    homeManagedCatsCount.textContent = !catReports.length
      ? '0마리 · 리포트 연결 대기'
      : `${catReports.length}마리 활동 중`;
  }

  if (!homeScreenTitleText) {
    return;
  }

  if (!catReports.length) {
    homeScreenTitleText.textContent = '리포트에 고양이를 연결하면 요약이 표시됩니다.';
    if (homeTimelineList) {
      homeTimelineList.innerHTML =
        '<li class="home-timeline-item muted">로그인 후 <code>cat_reports</code>에 데이터가 보이면 타임라인을 채울 수 있어요.</li>';
    }
    return;
  }

  const primaryReport = catReports[0];
  const displayName = primaryReport.cat_name?.trim() || '고양이';
  homeScreenTitleText.textContent = `메인 모니터링 · ${displayName}`;

  if (homeTimelineList) {
    const lines = catReports.slice(0, 3).map((report) => {
      const timeLabel = formatTimestampDisplayValue(report.last_event_time);
      return `<li class="home-timeline-item">${escapeHtml(timeLabel)} · 최근 이벤트 · ${escapeHtml(report.cat_name ?? '')}</li>`;
    });
    homeTimelineList.innerHTML = lines.join('');
  }
}

const DEMO_HOME_CAMERA_TILES = [
  { id: 'demo-1', name: '거실', is_online: false },
  { id: 'demo-2', name: '캣타워', is_online: false },
  { id: 'demo-3', name: '화장실', is_online: false },
  { id: 'demo-4', name: '부엌', is_online: false },
];

async function fetchProfileHomeIdForAuthUser(authUserId) {
  if (!authUserId) {
    cachedProfileHomeId = null;
    return null;
  }

  const { data, error } = await supabaseBrowserClient
    .from('profiles')
    .select('home_id')
    .eq('id', authUserId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  cachedProfileHomeId = data?.home_id ?? null;
  return cachedProfileHomeId;
}

function formatRelativeElapsedFromIso(isoString) {
  if (!isoString) {
    return '기록 없음';
  }
  let thenMs;
  try {
    thenMs = new Date(isoString).getTime();
  } catch {
    return '기록 없음';
  }
  if (Number.isNaN(thenMs)) {
    return '기록 없음';
  }
  const diffMs = Math.max(0, Date.now() - thenMs);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return '방금 전';
  }
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}시간 전`;
  }
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function buildHomeCameraTileButton({ id, name, isOnline, isDemo }) {
  const tileButton = document.createElement('button');
  tileButton.type = 'button';
  tileButton.className = `home-camera-tile${isDemo ? ' home-camera-tile--demo' : ''}`;
  tileButton.dataset.cameraId = id;
  tileButton.dataset.cameraName = name;
  tileButton.dataset.cameraOnline = String(Boolean(isOnline));
  tileButton.dataset.isDemo = isDemo ? '1' : '0';
  const statusClass = isOnline ? 'home-camera-status--on' : 'home-camera-status--off';
  const statusLabel = isOnline ? '온라인' : '오프라인';
  tileButton.innerHTML = `
    <span class="home-camera-status ${statusClass}">${escapeHtml(statusLabel)}</span>
    <span class="home-camera-name">${escapeHtml(name)}</span>
  `;
  return tileButton;
}

function renderHomeCameraGridWithDemoTiles() {
  if (!homeCameraGrid) {
    return;
  }
  homeCameraGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (const camera of DEMO_HOME_CAMERA_TILES) {
    fragment.appendChild(
      buildHomeCameraTileButton({
        id: camera.id,
        name: camera.name,
        isOnline: camera.is_online,
        isDemo: true,
      }),
    );
  }
  homeCameraGrid.appendChild(fragment);
  updateHomeLiveChannelBadgeFromDom();
}

function renderHomeCameraTilesFromDatabaseRows(cameraRows) {
  if (!homeCameraGrid) {
    return;
  }
  homeCameraGrid.innerHTML = '';
  if (!cameraRows.length) {
    renderHomeCameraGridWithDemoTiles();
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const row of cameraRows) {
    fragment.appendChild(
      buildHomeCameraTileButton({
        id: row.id,
        name: row.name ?? '카메라',
        isOnline: Boolean(row.is_online),
        isDemo: false,
      }),
    );
  }
  homeCameraGrid.appendChild(fragment);
  updateHomeLiveChannelBadgeFromDom();
}

function applyLatestEnvironmentLabelsFromLogRows(logRows) {
  let waterIso = null;
  let litterIso = null;
  for (const row of logRows) {
    if (row.kind === 'water_change' && waterIso === null) {
      waterIso = row.created_at;
    }
    if (row.kind === 'litter_clean' && litterIso === null) {
      litterIso = row.created_at;
    }
  }
  if (envWaterLastRelative) {
    envWaterLastRelative.textContent = formatRelativeElapsedFromIso(waterIso);
  }
  if (envLitterLastRelative) {
    envLitterLastRelative.textContent = formatRelativeElapsedFromIso(litterIso);
  }
}

function setHomeEnvironmentEtaLabelsForLoggedOut() {
  if (envWaterLastRelative) {
    envWaterLastRelative.textContent = '로그인 필요';
  }
  if (envLitterLastRelative) {
    envLitterLastRelative.textContent = '로그인 필요';
  }
}

function setHomeEnvironmentEtaLabelsEmpty() {
  if (envWaterLastRelative) {
    envWaterLastRelative.textContent = '기록 없음';
  }
  if (envLitterLastRelative) {
    envLitterLastRelative.textContent = '기록 없음';
  }
}

function openEnvironmentLogModal(environmentKind) {
  if (!environmentUpdateModal || !environmentModalKindInput) {
    return;
  }
  environmentModalKindInput.value = environmentKind;
  if (environmentModalTitle) {
    environmentModalTitle.textContent =
      environmentKind === 'water_change' ? '식수 교체 완료' : '화장실 청소 완료';
  }
  if (environmentModalDescription) {
    environmentModalDescription.textContent = '지금 시점을 기준으로 완료했습니다. 필요하면 메모를 남겨 주세요.';
  }
  if (environmentModalNoteInput) {
    environmentModalNoteInput.value = '';
  }
  environmentUpdateModal.showModal();
}

function closeEnvironmentLogModal() {
  environmentUpdateModal?.close();
}

function openCameraDetailModal({ id, name, isOnline, isDemo }) {
  if (!cameraDetailModal) {
    return;
  }
  if (cameraDetailTitle) {
    cameraDetailTitle.textContent = name || '카메라';
  }
  if (cameraDetailStatusLine) {
    cameraDetailStatusLine.textContent = isOnline
      ? '상태: 온라인 · 스트림은 연동 후 표시됩니다.'
      : '상태: 오프라인 · 기기 전원·네트워크를 확인해 주세요.';
  }
  cameraDetailModal.dataset.cameraId = id;
  cameraDetailModal.dataset.isDemo = isDemo ? '1' : '0';
  cameraDetailModal.showModal();
}

function closeCameraDetailModal() {
  cameraDetailModal?.close();
}

async function loadHomeDashboardData() {
  if (!homeCameraGrid) {
    return;
  }
  setHomeDashboardStatus('');

  const {
    data: { session: activeSession },
  } = await supabaseBrowserClient.auth.getSession();

  if (!activeSession?.user) {
    setHomeEnvironmentEtaLabelsForLoggedOut();
    renderHomeCameraGridWithDemoTiles();
    return;
  }

  try {
    const homeId = await fetchProfileHomeIdForAuthUser(activeSession.user.id);
    if (!homeId) {
      setHomeDashboardStatus(
        'profiles.home_id가 없습니다. Supabase에서 가족(home)을 연결해 주세요.',
        true,
      );
      setHomeEnvironmentEtaLabelsEmpty();
      renderHomeCameraGridWithDemoTiles();
      return;
    }

    const [environmentLogsResult, camerasResult] = await Promise.all([
      supabaseBrowserClient
        .from('environment_logs')
        .select('kind, created_at')
        .eq('home_id', homeId)
        .order('created_at', { ascending: false })
        .limit(80),
      supabaseBrowserClient
        .from('cameras')
        .select('id, name, is_online, stream_url')
        .eq('home_id', homeId)
        .order('name', { ascending: true }),
    ]);

    if (environmentLogsResult.error) {
      throw environmentLogsResult.error;
    }
    if (camerasResult.error) {
      throw camerasResult.error;
    }

    applyLatestEnvironmentLabelsFromLogRows(environmentLogsResult.data ?? []);
    renderHomeCameraTilesFromDatabaseRows(camerasResult.data ?? []);
  } catch (error) {
    console.error(error);
    setHomeDashboardStatus(`홈 데이터 불러오기 실패: ${error.message ?? error}`, true);
    setHomeEnvironmentEtaLabelsEmpty();
    renderHomeCameraGridWithDemoTiles();
  }
}

function wireHomeDashboardControls() {
  document.getElementById('envWaterCard')?.addEventListener('click', () => {
    void openEnvironmentLogModal('water_change');
  });
  document.getElementById('envLitterCard')?.addEventListener('click', () => {
    void openEnvironmentLogModal('litter_clean');
  });

  homeCareFabButton?.addEventListener('click', () => {
    void openEnvironmentLogModal('water_change');
  });

  environmentModalCancelButton?.addEventListener('click', () => {
    closeEnvironmentLogModal();
  });

  environmentLogForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rawKind = environmentModalKindInput?.value ?? '';
    if (rawKind !== 'water_change' && rawKind !== 'litter_clean') {
      setHomeDashboardStatus('유효하지 않은 기록 유형입니다.', true);
      return;
    }

    const {
      data: { session: formSession },
    } = await supabaseBrowserClient.auth.getSession();
    if (!formSession?.user) {
      setHomeDashboardStatus('로그인이 필요합니다.', true);
      return;
    }

    const homeId = await fetchProfileHomeIdForAuthUser(formSession.user.id);
    if (!homeId) {
      setHomeDashboardStatus('profiles.home_id가 없어 기록할 수 없습니다.', true);
      return;
    }

    const noteText = environmentModalNoteInput?.value?.trim() ?? '';

    const { error } = await supabaseBrowserClient.from('environment_logs').insert({
      home_id: homeId,
      kind: rawKind,
      source: 'manual',
      note: noteText || null,
    });

    if (error) {
      console.error(error);
      setHomeDashboardStatus(`저장 실패: ${error.message ?? error}`, true);
      return;
    }

    closeEnvironmentLogModal();
    setHomeDashboardStatus('기록을 저장했습니다.');
    await loadHomeDashboardData();
  });

  homeCameraGrid?.addEventListener('click', (event) => {
    const tileButton = event.target.closest('.home-camera-tile');
    if (!(tileButton instanceof HTMLButtonElement)) {
      return;
    }
    openCameraDetailModal({
      id: tileButton.dataset.cameraId ?? '',
      name: tileButton.dataset.cameraName ?? '카메라',
      isOnline: tileButton.dataset.cameraOnline === 'true',
      isDemo: tileButton.dataset.isDemo === '1',
    });
  });

  cameraDetailCloseButton?.addEventListener('click', () => {
    closeCameraDetailModal();
  });

  cameraVoiceBroadcastButton?.addEventListener('click', () => {
    const isDemo = cameraDetailModal?.dataset.isDemo === '1';
    if (isDemo) {
      setHomeDashboardStatus('데모 카메라입니다. 실제 카메라를 등록한 뒤 음성 송출을 연동할 수 있어요.');
    } else {
      setHomeDashboardStatus('음성 송출은 준비 중입니다. (추후 스트림·기기 연동)');
    }
  });
}

function setHealthReportWeekRangeTitle() {
  if (!healthReportRangeTitle) {
    return;
  }
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6);
  const formatShort = (date) =>
    `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  healthReportRangeTitle.textContent = `주간 AI 건강 리포트 (${formatShort(weekStart)} – ${formatShort(weekEnd)})`;
}

function openSplashScreen() {
  splashScreen?.classList.remove('hidden');
  appShell?.classList.add('hidden');
  loginScreen?.classList.add('hidden');
}

/** 로그인된 사용자에게 메인 앱(홈 = CAT-visor 02) 표시 */
function revealAppForAuthenticatedUser() {
  try {
    sessionStorage.removeItem(LOGIN_SCREEN_SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem('dabonyang_onboarding_complete', '1');
  } catch {
    /* ignore */
  }
  loginScreen?.classList.add('hidden');
  splashScreen?.classList.add('hidden');
  appShell?.classList.remove('hidden');
}

function setLoginFormMessage(messageText, isError = false) {
  if (!loginFormMessage) {
    return;
  }
  loginFormMessage.textContent = messageText;
  loginFormMessage.dataset.error = isError ? 'true' : 'false';
}

/** CAT-visor 01 「시작하기」→ 로그인 화면 */
function openLoginScreenFromSplash() {
  try {
    sessionStorage.setItem(LOGIN_SCREEN_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
  splashScreen?.classList.add('hidden');
  loginScreen?.classList.remove('hidden');
  appShell?.classList.add('hidden');
  setLoginFormMessage('', false);
}

/** 「처음 화면으로」 */
function closeLoginScreenAndShowSplash() {
  try {
    sessionStorage.removeItem(LOGIN_SCREEN_SESSION_KEY);
  } catch {
    /* ignore */
  }
  loginScreen?.classList.add('hidden');
  splashScreen?.classList.remove('hidden');
  appShell?.classList.add('hidden');
  setLoginFormMessage('', false);
}

/** 이메일/비밀번호 또는 소셜 로그인 성공 후 홈으로 진입 */
function enterAppAfterSuccessfulLogin() {
  revealAppForAuthenticatedUser();
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#home`);
  switchMainTab('home', { updateHash: false });

  void supabaseBrowserClient.auth.getSession().then(({ data: { session: activeSession } }) => {
    if (activeSession?.user) {
      loadAndRenderCatReports();
      void loadHomeDashboardData();
      subscribeToBehaviorEventInserts();
    }
  });
}

function dismissSplashScreen() {
  try {
    sessionStorage.removeItem(LOGIN_SCREEN_SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem('dabonyang_onboarding_complete', '1');
  } catch {
    /* ignore */
  }
  splashScreen?.classList.add('hidden');
  loginScreen?.classList.add('hidden');
  appShell?.classList.remove('hidden');
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#home`);
  const tabId = readInitialMainTabFromLocationHash();
  switchMainTab(tabId, { updateHash: false });

  void supabaseBrowserClient.auth.getSession().then(({ data: { session: activeSession } }) => {
    if (activeSession?.user) {
      loadAndRenderCatReports();
      void loadHomeDashboardData();
      subscribeToBehaviorEventInserts();
    }
  });
}

async function signInWithEmailAndPasswordFromForm(event) {
  event.preventDefault();
  const rawEmail = loginEmailInput?.value?.trim() ?? '';
  const rawPassword = loginPasswordInput?.value ?? '';
  if (!rawEmail || !rawPassword) {
    setLoginFormMessage('이메일과 비밀번호를 입력해 주세요.', true);
    return;
  }

  loginSubmitButton.disabled = true;
  setLoginFormMessage('로그인 중…', false);

  const { error } = await supabaseBrowserClient.auth.signInWithPassword({
    email: rawEmail,
    password: rawPassword,
  });

  loginSubmitButton.disabled = false;

  if (error) {
    setLoginFormMessage(error.message ?? '로그인에 실패했습니다.', true);
    return;
  }

  enterAppAfterSuccessfulLogin();
}

async function signInWithOAuthProvider(oauthProviderName) {
  setLoginFormMessage(`${oauthProviderName === 'google' ? 'Google' : '카카오'} 로그인으로 이동합니다…`, false);
  const { error } = await supabaseBrowserClient.auth.signInWithOAuth({
    provider: oauthProviderName,
    options: {
      redirectTo: buildOAuthRedirectUrlForCurrentPage(),
    },
  });

  if (error) {
    setLoginFormMessage(error.message ?? '로그인을 시작할 수 없습니다.', true);
  }
}

async function loadAndRenderCatReports() {
  setStatusMessage('요약을 불러오는 중…');
  try {
    const reports = await fetchCatReportsFromSupabase();
    renderCatReportCards(reports);
    updateHomeDashboardFromReports(reports);
    setStatusMessage(`최신 요약 · ${new Date().toLocaleTimeString('ko-KR')}`);
  } catch (error) {
    console.error(error);
    setStatusMessage(`불러오기 실패: ${error.message ?? error}`, true);
  }
}

function getPanelElementForTabId(tabId) {
  const map = {
    home: panelHome,
    community: panelCommunity,
    health: panelHealth,
    account: panelAccount,
  };
  return map[tabId] ?? null;
}

function switchMainTab(nextTabId, { updateHash = true } = {}) {
  if (!MAIN_TAB_IDS.includes(nextTabId)) {
    return;
  }

  for (const tabId of MAIN_TAB_IDS) {
    const panel = getPanelElementForTabId(tabId);
    if (!panel) continue;
    const isActive = tabId === nextTabId;
    panel.classList.toggle('hidden', !isActive);
  }

  for (const button of mainTabButtons) {
    const target = button.getAttribute('data-tab-target');
    const isActive = target === nextTabId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }

  if (updateHash) {
    const nextHash = nextTabId === 'home' ? '' : `#${nextTabId}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }
}

function readInitialMainTabFromLocationHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (raw === 'splash') {
    return 'home';
  }
  if (MAIN_TAB_IDS.includes(raw)) {
    return raw;
  }
  return 'home';
}

async function fetchAppUserProfileIdForSession(authUserId) {
  if (!authUserId) {
    cachedAppUserProfileId = null;
    return null;
  }

  const { data, error } = await supabaseBrowserClient
    .from('app_users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    console.error(error);
    cachedAppUserProfileId = null;
    return null;
  }

  cachedAppUserProfileId = data?.id ?? null;
  return cachedAppUserProfileId;
}

async function fetchCommunityTopicsFromSupabase() {
  const { data, error } = await supabaseBrowserClient
    .from('community_topics')
    .select('id, slug, label_ko, sort_order')
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

function renderCommunityTopicFilterChips() {
  communityTopicFilters.innerHTML = '';

  const allTopicsButton = document.createElement('button');
  allTopicsButton.type = 'button';
  allTopicsButton.className = `topic-chip${selectedCommunityTopicFilterId === null ? ' is-active' : ''}`;
  allTopicsButton.setAttribute('role', 'tab');
  allTopicsButton.setAttribute('data-topic-filter', '');
  allTopicsButton.setAttribute('aria-selected', selectedCommunityTopicFilterId === null ? 'true' : 'false');
  allTopicsButton.textContent = '전체';
  communityTopicFilters.appendChild(allTopicsButton);

  for (const topic of cachedCommunityTopics) {
    const topicChipButton = document.createElement('button');
    topicChipButton.type = 'button';
    topicChipButton.className = `topic-chip${selectedCommunityTopicFilterId === topic.id ? ' is-active' : ''}`;
    topicChipButton.setAttribute('role', 'tab');
    topicChipButton.setAttribute('data-topic-filter', topic.id);
    topicChipButton.setAttribute(
      'aria-selected',
      selectedCommunityTopicFilterId === topic.id ? 'true' : 'false',
    );
    topicChipButton.textContent = topic.label_ko;
    communityTopicFilters.appendChild(topicChipButton);
  }
}

function populateCommunityPostTopicSelect() {
  communityPostTopic.innerHTML = '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '주제 선택 안 함';
  communityPostTopic.appendChild(emptyOption);

  for (const topic of cachedCommunityTopics) {
    const optionElement = document.createElement('option');
    optionElement.value = topic.id;
    optionElement.textContent = topic.label_ko;
    communityPostTopic.appendChild(optionElement);
  }
}

function setActiveTopicFilterChip(clickedChipButton) {
  const chipButtons = communityTopicFilters.querySelectorAll('.topic-chip');
  for (const chipButton of chipButtons) {
    const isActive = chipButton === clickedChipButton;
    chipButton.classList.toggle('is-active', isActive);
    chipButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }
}

async function loadCommunityTopicsIntoUi() {
  try {
    cachedCommunityTopics = await fetchCommunityTopicsFromSupabase();
    renderCommunityTopicFilterChips();
    populateCommunityPostTopicSelect();
  } catch (error) {
    console.error(error);
    communityPostTopic.innerHTML = '<option value="">주제를 불러오지 못했습니다</option>';
    setCommunityStatusMessage(`주제 목록 불러오기 실패: ${error.message ?? error}`, true);
  }
}

async function fetchCommunityPostsFeedFromSupabase() {
  let postsQuery = supabaseBrowserClient
    .from('community_posts_feed')
    .select(
      'id, user_id, title, body, category, topic_id, topic_slug, topic_label_ko, like_count, comment_count, created_at, updated_at, author_display_name',
    )
    .order('created_at', { ascending: false });

  if (selectedCommunityTopicFilterId) {
    postsQuery = postsQuery.eq('topic_id', selectedCommunityTopicFilterId);
  }

  const { data, error } = await postsQuery;

  if (error) {
    throw error;
  }

  return data ?? [];
}

function renderCommunityPostCards(posts) {
  communityPostList.innerHTML = '';

  if (!posts.length) {
    communityEmptyState.classList.remove('hidden');
    return;
  }

  communityEmptyState.classList.add('hidden');

  const fragment = document.createDocumentFragment();

  for (const post of posts) {
    const article = document.createElement('article');
    article.className = 'community-post-card';
    const authorLetter = buildAvatarLetterFromLabel(post.author_display_name, 'C');
    const topicLabelForBadge = post.topic_label_ko ?? post.category ?? '';
    const categoryLabel = topicLabelForBadge
      ? `<span class="community-post-category">${escapeHtml(topicLabelForBadge)}</span>`
      : '';
    article.innerHTML = `
      <div class="community-post-inner">
        <div class="community-post-top">
          <div class="community-post-avatar" aria-hidden="true">${escapeHtml(authorLetter)}</div>
          <div class="community-post-head">
            <div class="community-post-header">
              <h3 class="community-post-title">${escapeHtml(post.title ?? '')}</h3>
              <span class="community-post-meta">${escapeHtml(post.author_display_name ?? '')} · ${formatTimestampDisplayValue(post.created_at)}</span>
            </div>
            ${categoryLabel}
          </div>
        </div>
        <p class="community-post-body">${escapeHtml(post.body ?? '')}</p>
        <div class="community-post-stats">좋아요 ${post.like_count ?? 0} · 댓글 ${post.comment_count ?? 0}</div>
      </div>
    `;
    fragment.appendChild(article);
  }

  communityPostList.appendChild(fragment);
}

async function loadAndRenderCommunityPosts() {
  setCommunityStatusMessage('커뮤니티 글을 불러오는 중…');
  try {
    const posts = await fetchCommunityPostsFeedFromSupabase();
    renderCommunityPostCards(posts);
    setCommunityStatusMessage(`커뮤니티 · ${new Date().toLocaleTimeString('ko-KR')}`);
  } catch (error) {
    console.error(error);
    setCommunityStatusMessage(`불러오기 실패: ${error.message ?? error}`, true);
  }
}

async function fetchMyCatHealthWeeklyFromSupabase() {
  const { data, error } = await supabaseBrowserClient
    .from('my_cat_health_weekly')
    .select(
      'cat_id, cat_name, avg_pain_score_7d, behavior_events_7d, pain_samples_7d, latest_pain_score, latest_pain_at',
    )
    .order('cat_name', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchMyAppProfileFromSupabase() {
  const { data, error } = await supabaseBrowserClient
    .from('my_app_profile')
    .select('id, email, nickname, timezone, created_at')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function renderHealthDashboardFromRows(healthRows) {
  if (!healthActivitySummary || !healthPainSummary || !healthAiSummaryText) {
    return;
  }

  if (!healthRows.length) {
    healthActivitySummary.textContent = '최근 7일 행동 이벤트가 없거나, 고양이가 아직 연결되지 않았습니다.';
    healthPainSummary.textContent = '통증 분석 기록이 없습니다.';
    healthAiSummaryText.textContent =
      '로그인한 뒤 app_users·cats가 연결되면 Supabase 뷰 my_cat_health_weekly에서 집계됩니다.';
    if (healthReportRangeSub) {
      healthReportRangeSub.textContent = '데이터가 없습니다. Supabase에서 프로필·고양이를 연결해 주세요.';
    }
    return;
  }

  const totalBehaviorEvents = healthRows.reduce(
    (sum, row) => sum + (Number(row.behavior_events_7d) || 0),
    0,
  );
  const totalPainSamples = healthRows.reduce(
    (sum, row) => sum + (Number(row.pain_samples_7d) || 0),
    0,
  );

  healthActivitySummary.textContent = `전체 고양이 합계: 행동 이벤트 ${totalBehaviorEvents}건 (최근 7일, behavior_events)`;
  healthPainSummary.textContent = `통증 분석 샘플 ${totalPainSamples}건 (최근 7일, pain_analyses)`;

  healthAiSummaryText.innerHTML = healthRows
    .map((row) => {
      const name = escapeHtml(row.cat_name ?? '');
      const avg = escapeHtml(String(row.avg_pain_score_7d ?? '—'));
      const latest = escapeHtml(formatPainScoreDisplayValue(row.latest_pain_score));
      const at = escapeHtml(formatTimestampDisplayValue(row.latest_pain_at));
      return `<p class="health-ai-line">${name}: 7일 평균 통증 ${avg} · 최근 ${latest} (${at})</p>`;
    })
    .join('');

  if (healthReportRangeSub) {
    healthReportRangeSub.textContent = `등록 고양이 ${healthRows.length}마리 · Supabase my_cat_health_weekly (7일)`;
  }
}

async function loadAndRenderHealthDashboard() {
  const {
    data: { session: activeSession },
  } = await supabaseBrowserClient.auth.getSession();

  if (!activeSession?.user) {
    renderHealthDashboardFromRows([]);
    return;
  }

  try {
    const healthRows = await fetchMyCatHealthWeeklyFromSupabase();
    renderHealthDashboardFromRows(healthRows);
  } catch (error) {
    console.error(error);
    if (healthActivitySummary) {
      healthActivitySummary.textContent = `불러오기 실패: ${error.message ?? error}`;
    }
  }
}

async function loadAndRenderAccountProfile() {
  const {
    data: { session: activeSession },
  } = await supabaseBrowserClient.auth.getSession();

  if (!activeSession?.user) {
    if (accountProfileName) {
      accountProfileName.textContent = '로그인 · 프로필';
    }
    if (accountProfileSub) {
      accountProfileSub.textContent = '로그인 후 Supabase my_app_profile 뷰로 조회됩니다.';
    }
    return;
  }

  try {
    const profileRow = await fetchMyAppProfileFromSupabase();
    if (!profileRow) {
      if (accountProfileName) {
        accountProfileName.textContent = '프로필 없음';
      }
      if (accountProfileSub) {
        accountProfileSub.textContent =
          'app_users에 행이 없습니다. auth_user_id를 현재 로그인과 연결해 주세요.';
      }
      return;
    }

    const nickname = profileRow.nickname?.trim();
    const emailLocal = (activeSession.user.email ?? profileRow.email ?? '').split('@')[0] || '사용자';
    if (accountProfileName) {
      accountProfileName.textContent = nickname ? `${nickname} · 프로필` : `${emailLocal} · 프로필`;
    }
    if (accountProfileSub) {
      const email = profileRow.email ?? activeSession.user.email ?? '—';
      accountProfileSub.textContent = `${email} · ${profileRow.timezone ?? 'Asia/Seoul'} · my_app_profile`;
    }
  } catch (error) {
    console.error(error);
    if (accountProfileSub) {
      accountProfileSub.textContent = `프로필 불러오기 실패: ${error.message ?? error}`;
    }
  }
}

function loadTabPanelDataIfNeeded(tabId) {
  if (tabId === 'home') {
    void loadHomeDashboardData();
  }
  if (tabId === 'community') {
    loadAndRenderCommunityPosts();
  }
  if (tabId === 'health') {
    loadAndRenderHealthDashboard();
  }
  if (tabId === 'account') {
    loadAndRenderAccountProfile();
  }
}

function updateSessionUi(session) {
  const isSignedIn = Boolean(session?.user);

  githubLoginButton.classList.toggle('hidden', isSignedIn);
  logoutButton.classList.toggle('hidden', !isSignedIn);
  if (refreshReportsButton) {
    refreshReportsButton.disabled = !isSignedIn;
  }
  refreshCommunityButton.disabled = false;
  communityComposer.hidden = !isSignedIn;
  communityPostSubmitButton.disabled = !isSignedIn;

  if (isSignedIn) {
    const email = session.user.email ?? '';
    const provider = session.user.app_metadata?.provider ?? 'oauth';
    sessionSummary.textContent = `${provider} · ${email || session.user.id.slice(0, 8)}…`;
    accountSessionDetail.textContent = `${provider} · ${email || session.user.id}`;
  } else {
    sessionSummary.textContent = '로그인되지 않음';
    accountSessionDetail.textContent = '로그인하면 커뮤니티 글 작성과 고양이 요약을 이용할 수 있습니다.';
    cachedAppUserProfileId = null;
  }

  void loadAndRenderAccountProfile();
}

function subscribeToBehaviorEventInserts() {
  if (behaviorEventsRealtimeChannel) {
    supabaseBrowserClient.removeChannel(behaviorEventsRealtimeChannel);
    behaviorEventsRealtimeChannel = null;
  }

  behaviorEventsRealtimeChannel = supabaseBrowserClient
    .channel('behavior-events-inserts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'behavior_events' },
      () => {
        realtimeStatus.textContent = '이벤트 수신 · 요약 갱신';
        loadAndRenderCatReports();
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        realtimeStatus.textContent = '실시간 연결됨';
      } else if (status === 'CHANNEL_ERROR') {
        realtimeStatus.textContent = '실시간 오류 (새로고침)';
      } else {
        realtimeStatus.textContent = status;
      }
    });
}

async function signInWithGitHubOAuth() {
  setStatusMessage('GitHub 로그인으로 이동합니다…');
  const { error } = await supabaseBrowserClient.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: buildOAuthRedirectUrlForCurrentPage(),
    },
  });

  if (error) {
    setStatusMessage(`로그인 시작 실패: ${error.message}`, true);
  }
}

async function signOutFromSupabase() {
  const { error } = await supabaseBrowserClient.auth.signOut();
  if (error) {
    setStatusMessage(`로그아웃 실패: ${error.message}`, true);
    return;
  }
  renderCatReportCards([]);
  updateHomeDashboardFromReports([]);
  renderCommunityPostCards([]);
  renderHealthDashboardFromRows([]);
  communityEmptyState.classList.remove('hidden');
  setStatusMessage('로그아웃되었습니다.');
  setCommunityStatusMessage('로그인하면 커뮤니티를 볼 수 있습니다.');
  void loadHomeDashboardData();
}

function wireDashboardEventHandlers() {
  wireHomeDashboardControls();

  themeToggleButton?.addEventListener('click', toggleTheme);
  themeMenuToggle?.addEventListener('click', toggleTheme);

  splashStartButton?.addEventListener('click', openLoginScreenFromSplash);
  splashSkipButton?.addEventListener('click', dismissSplashScreen);
  loginPasswordForm?.addEventListener('submit', signInWithEmailAndPasswordFromForm);
  loginGoogleButton?.addEventListener('click', () => void signInWithOAuthProvider('google'));
  loginKakaoButton?.addEventListener('click', () => void signInWithOAuthProvider('kakao'));
  loginBackButton?.addEventListener('click', closeLoginScreenAndShowSplash);
  showSplashAgainButton?.addEventListener('click', () => {
    window.location.hash = 'splash';
    openSplashScreen();
  });

  githubLoginButton.addEventListener('click', signInWithGitHubOAuth);
  logoutButton.addEventListener('click', signOutFromSupabase);
  refreshReportsButton?.addEventListener('click', loadAndRenderCatReports);
  refreshCommunityButton.addEventListener('click', loadAndRenderCommunityPosts);

  for (const link of screenFlowLinks) {
    link.addEventListener('click', () => {
      const targetTabId = link.getAttribute('data-tab-target');
      if (!targetTabId) {
        return;
      }
      try {
        localStorage.setItem('dabonyang_onboarding_complete', '1');
      } catch {
        /* ignore */
      }
      splashScreen?.classList.add('hidden');
      loginScreen?.classList.add('hidden');
      appShell?.classList.remove('hidden');
      switchMainTab(targetTabId, { updateHash: true });
      loadTabPanelDataIfNeeded(targetTabId);
      void supabaseBrowserClient.auth.getSession().then(({ data: { session: activeSession } }) => {
        if (activeSession?.user) {
          loadAndRenderCatReports();
          subscribeToBehaviorEventInserts();
        }
      });
    });
  }

  communityTopicFilters.addEventListener('click', (event) => {
    const clickedChip = event.target.closest('[data-topic-filter]');
    if (!clickedChip || !(clickedChip instanceof HTMLButtonElement)) {
      return;
    }
    const rawTopicId = clickedChip.getAttribute('data-topic-filter') ?? '';
    selectedCommunityTopicFilterId = rawTopicId === '' ? null : rawTopicId;
    setActiveTopicFilterChip(clickedChip);
    loadAndRenderCommunityPosts();
  });

  for (const button of mainTabButtons) {
    button.addEventListener('click', () => {
      const nextTabId = button.getAttribute('data-tab-target');
      switchMainTab(nextTabId, { updateHash: true });
      if (nextTabId) {
        loadTabPanelDataIfNeeded(nextTabId);
      }
    });
  }

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#splash') {
      openSplashScreen();
      return;
    }
    if (!appShell?.classList.contains('hidden')) {
      const tabId = readInitialMainTabFromLocationHash();
      switchMainTab(tabId, { updateHash: false });
      loadTabPanelDataIfNeeded(tabId);
    }
  });

  communityPostForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const {
      data: { session: activeSession },
    } = await supabaseBrowserClient.auth.getSession();

    if (!activeSession?.user) {
      setCommunityStatusMessage('로그인이 필요합니다.', true);
      return;
    }

    let appUserId = cachedAppUserProfileId;
    if (!appUserId) {
      appUserId = await fetchAppUserProfileIdForSession(activeSession.user.id);
    }

    if (!appUserId) {
      setCommunityStatusMessage(
        'app_users에 연결된 프로필이 없습니다. Supabase에서 auth_user_id를 연결해 주세요.',
        true,
      );
      return;
    }

    const title = communityPostTitle.value.trim();
    const body = communityPostBody.value.trim();
    const selectedTopicId = communityPostTopic.value.trim() || null;
    const matchedTopicRow = cachedCommunityTopics.find((topic) => topic.id === selectedTopicId);
    const legacyCategoryText = matchedTopicRow ? matchedTopicRow.label_ko : null;

    if (!title || !body) {
      setCommunityStatusMessage('제목과 내용을 입력해 주세요.', true);
      return;
    }

    communityPostSubmitButton.disabled = true;
    setCommunityStatusMessage('게시 중…');

    const { error } = await supabaseBrowserClient.from('community_posts').insert({
      user_id: appUserId,
      title,
      body,
      category: legacyCategoryText,
      topic_id: selectedTopicId,
    });

    communityPostSubmitButton.disabled = false;

    if (error) {
      console.error(error);
      setCommunityStatusMessage(`게시 실패: ${error.message ?? error}`, true);
      return;
    }

    communityPostForm.reset();
    setCommunityStatusMessage('게시되었습니다.');
    await loadAndRenderCommunityPosts();
  });
}

async function initializeDashboard() {
  wireDashboardEventHandlers();

  // 저장된 테마 적용 (FOUC 방지 인라인 스크립트가 이미 적용했지만 라벨 동기화)
  applyThemeToDocument(readCurrentTheme());

  setHealthReportWeekRangeTitle();

  const {
    data: { session: initialSession },
  } = await supabaseBrowserClient.auth.getSession();

  if (initialSession?.user) {
    if (window.location.hash === '#splash') {
      openSplashScreen();
    } else {
      revealAppForAuthenticatedUser();
    }
  } else if (window.location.hash === '#splash') {
    openSplashScreen();
  }

  if (appShell && !appShell.classList.contains('hidden')) {
    const initialTabId = readInitialMainTabFromLocationHash();
    switchMainTab(initialTabId, { updateHash: false });
  }

  await loadCommunityTopicsIntoUi();

  updateSessionUi(initialSession);

  if (initialSession?.user) {
    await fetchAppUserProfileIdForSession(initialSession.user.id);
  }

  if (!initialSession) {
    renderCatReportCards([]);
    updateHomeDashboardFromReports([]);
    renderCommunityPostCards([]);
    communityEmptyState.classList.remove('hidden');
    setStatusMessage('로그인하면 고양이 요약이 표시됩니다.');
    setCommunityStatusMessage('로그인하면 커뮤니티 글을 읽고 쓸 수 있습니다.');
    void loadHomeDashboardData();
  }

  if (appShell && !appShell.classList.contains('hidden')) {
    const initialTabId = readInitialMainTabFromLocationHash();
    loadTabPanelDataIfNeeded(initialTabId);
  }

  supabaseBrowserClient.auth.onAuthStateChange(async (_event, nextSession) => {
    updateSessionUi(nextSession);

    if (nextSession?.user) {
      if (window.location.hash !== '#splash') {
        revealAppForAuthenticatedUser();
      }
      await fetchAppUserProfileIdForSession(nextSession.user.id);
      await loadAndRenderCatReports();
      void loadHomeDashboardData();
      subscribeToBehaviorEventInserts();
      const activeTab = readInitialMainTabFromLocationHash();
      loadTabPanelDataIfNeeded(activeTab);
    } else {
      if (behaviorEventsRealtimeChannel) {
        supabaseBrowserClient.removeChannel(behaviorEventsRealtimeChannel);
        behaviorEventsRealtimeChannel = null;
      }
      renderCatReportCards([]);
      updateHomeDashboardFromReports([]);
      renderCommunityPostCards([]);
      renderHealthDashboardFromRows([]);
      communityEmptyState.classList.remove('hidden');
      realtimeStatus.textContent = '연결 대기';
      setStatusMessage('로그인하면 고양이 요약이 표시됩니다.');
      setCommunityStatusMessage('로그인하면 커뮤니티 글을 읽고 쓸 수 있습니다.');
      void loadHomeDashboardData();
    }
  });
}

initializeDashboard().catch((error) => {
  console.error(error);
  setStatusMessage(`초기화 실패: ${error.message ?? error}`, true);
});
