import { createClient } from '@supabase/supabase-js';
import { initAuth, SUPABASE_URL, SUPABASE_KEY } from './auth';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
    });
}

let COLUMNS = [
    { id: 'item_no', label: '번호', width: '50px' },
    { id: 'product_name', label: '제작명', width: '200px' },
    { id: 'instruction_no', label: '제조번호', width: '120px' },
    { id: 'item_name', label: '품명', width: '150px' },
    { id: 'spec', label: '규격/도번', width: '150px' },
    { id: 'material', label: '재질', width: '120px' },
    { id: 'base_material', label: '소재', width: '120px' },
    { id: 'quantity', label: '자재수', width: '70px' },
    { id: 'remarks', label: '비고', width: '150px' },
    { id: 'order_date', label: '발주', width: '100px' },
    { id: 'company', label: '업체', width: '100px' },
    { id: 'confirmed_date', label: '확인', width: '80px' }
];

let state = {
    data: [],
    filteredData: [],
    activeFilters: {},
    globalSearch: '',
    topProduct: 'all',
    topInstruction: 'all',
    selectedRowId: null,
    columnWidths: JSON.parse(localStorage.getItem('columnWidths') || '{}'),
    currentFilterCol: null // 현재 열려 있는 필터 컬럼 추적
};

(async function init() {
    try {
        setupEventListeners();
        applySavedWidths();
        try { initAuth(); } catch(e) {}
        await fetchData();

        // 실시간 구독: 서버 데이터 변경 시 즉시 리스트 갱신
        supabase
            .channel('instructions_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'instructions' }, () => {
                fetchData();
            })
            .subscribe();

        // 실시간 동기화 상태 수신
        supabase
            .channel('sync-status')
            .on('broadcast', { event: 'status' }, ({ payload }) => {
                const statusText = document.getElementById('sync-status-text');
                const statusDot = document.querySelector('.status-dot');
                if (statusText) statusText.textContent = payload.message;
                if (statusDot) {
                    if (payload.isSyncing) statusDot.classList.add('syncing');
                    else statusDot.classList.remove('syncing');
                }
            })
            .subscribe();

    } catch (err) { showError('초기화 실패'); }
})();

function applySavedWidths() {
    Object.entries(state.columnWidths).forEach(([id, w]) => {
        const safeVarName = id.replace(/[^a-zA-Z0-9]/g, '_');
        document.documentElement.style.setProperty(`--col-${safeVarName}-w`, w);
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.globalSearch = e.target.value.toLowerCase();
            applyFilters();
        });
    }

    const pDD = document.getElementById('top-product-dropdown');
    const iDD = document.getElementById('top-instruction-dropdown');
    if (pDD) pDD.addEventListener('change', (e) => { state.topProduct = e.target.value; applyFilters(); });
    if (iDD) iDD.addEventListener('change', (e) => { state.topInstruction = e.target.value; applyFilters(); });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-popup') && !e.target.closest('.header-inner')) {
            closeAllPopups();
        }
    });

    window.addEventListener('resize', () => autoFitTextAll());
}

async function fetchData() {
    try {
        // 아이템 번호(item_no) 순으로 정렬하여 위치 고정
        const { data, error } = await supabase.from('instructions').select('*').order('item_no', { ascending: true });
        if (error) throw error;
        
        state.data = (data || []).sort((a, b) => {
            // 1순위: 제조번호 (내림차순 - 높은 번호가 위로)
            const instA = String(a.instruction_no || '');
            const instB = String(b.instruction_no || '');
            const instSort = instB.localeCompare(instA, undefined, { numeric: true });
            if (instSort !== 0) return instSort;

            // 2순위: 번호 (오름차순 - 낮은 번호가 위로)
            const numA = parseInt(a.item_no) || 0;
            const numB = parseInt(b.item_no) || 0;
            return numA - numB || (a.id > b.id ? 1 : -1);
        });
        
        updateDynamicColumns();
        updateTopDropdowns();
        applyFilters();
    } catch (err) { 
        console.error('Fetch Error:', err);
        showError('데이터 로딩 실패: ' + (err.message || '알 수 없는 에러')); 
    }
}

function updateDynamicColumns() {
    if (state.data.length === 0) return;
    
    // 엑셀에서 새로 추가된 모든 키를 수집
    const extraKeys = new Set();
    state.data.forEach(row => {
        if (row.extra_data) {
            Object.keys(row.extra_data).forEach(k => extraKeys.add(k));
        }
    });

    // 기존 리스트에 없는 항목들만 뒤에 추가
    extraKeys.forEach(key => {
        if (!COLUMNS.find(c => c.id === key)) {
            COLUMNS.push({ id: key, label: key, width: '100px', isExtra: true });
        }
    });
}

function updateTopDropdowns() {
    const pDD = document.getElementById('top-product-dropdown');
    const iDD = document.getElementById('top-instruction-dropdown');
    if (pDD) {
        const ps = [...new Set(state.data.map(item => item.product_name))].filter(Boolean).sort();
        pDD.innerHTML = '<option value="all">제작명 전체</option>' + ps.map(p => `<option value="${p}">${p}</option>`).join('');
    }
    if (iDD) {
        const is = [...new Set(state.data.map(item => item.instruction_no))].filter(Boolean).sort();
        iDD.innerHTML = '<option value="all">제조번호 전체</option>' + is.map(i => `<option value="${i}">${i}</option>`).join('');
    }
}

function applyFilters() {
    state.filteredData = state.data.filter(item => {
        if (state.topProduct !== 'all' && item.product_name !== state.topProduct) return false;
        if (state.topInstruction !== 'all' && item.instruction_no !== state.topInstruction) return false;
        const pass = Object.entries(state.activeFilters).every(([id, set]) => !set || set.size === 0 || set.has(String(item[id] || '').trim()));
        if (!pass) return false;
        if (state.globalSearch) {
            const txt = Object.values(item).join(' ').toLowerCase();
            if (!txt.includes(state.globalSearch)) return false;
        }
        return true;
    });
    renderGrid();
}

function highlightText(text) {
    if (!state.globalSearch || !text) return text;
    const regex = new RegExp(`(${state.globalSearch})`, 'gi');
    return String(text).replace(regex, '<mark>$1</mark>');
}

function renderGrid() {
    const header = document.getElementById('grid-header');
    const body = document.getElementById('grid-body');
    if (!header || !body) return;

    header.innerHTML = COLUMNS.map(col => {
        const safeVarName = col.id.replace(/[^a-zA-Z0-9]/g, '_');
        return `
            <div class="grid-cell header" data-col-id="${col.id}" style="width: var(--col-${safeVarName}-w, ${col.width}) !important;">
                <div class="header-inner">
                    <span class="header-text text-shrink">${col.label}</span>
                    <div class="filter-trigger ${state.activeFilters[col.id]?.size > 0 ? 'active' : ''}" data-col-id="${col.id}"></div>
                </div>
                <div class="resizer"></div>
            </div>
        `;
    }).join('');

    body.innerHTML = state.filteredData.length === 0 
        ? `<div style="text-align:center; padding:50px; color:#666; width: 100%;">데이터 없음</div>`
        : state.filteredData.map((row, index) => {
            const isConfirmed = !!(row.confirmed_date && row.confirmed_date.trim());
            return `
                <div class="grid-row ${isConfirmed ? 'confirmed' : ''}" data-id="${row.id}" style="--row-index: ${index}">
                    ${COLUMNS.map(col => {
                        const isConfirmedCol = col.id === 'confirmed_date';
                        const cellValue = row[col.id] ?? (row.extra_data ? row.extra_data[col.id] : '') ?? '';
                        const safeVarName = col.id.replace(/[^a-zA-Z0-9]/g, '_');
                        
                        return `
                            <div class="grid-cell" data-col-id="${col.id}" 
                                style="width: var(--col-${safeVarName}-w, ${col.width}) !important;"
                                ${!isConfirmedCol ? `onclick="openInlineEditor(this, '${row.id}', '${col.id}', ${!!col.isExtra})"` : ''}>
                                <div class="cell-inner">
                                    ${isConfirmedCol ? `
                                        <input type="checkbox" class="confirmed-checkbox" 
                                            ${isConfirmed ? 'checked' : ''} 
                                            onclick="toggleRowConfirm(event, '${row.id}')">
                                    ` : `
                                        <span class="text-shrink">${highlightText(cellValue)}</span>
                                    `}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('');

    attachRowEvents();
    attachResizerEvents();
    attachFilterEvents(); 
    autoFitTextAll();
}

function attachFilterEvents() {
    document.querySelectorAll('.header-inner').forEach(inner => {
        inner.onclick = (e) => {
            e.stopPropagation();
            const colId = inner.closest('.grid-cell').dataset.colId;
            
            // 토글 로직: 이미 열려 있는 컬럼이면 닫고 종료
            if (state.currentFilterCol === colId) {
                closeAllPopups();
                return;
            }
            
            openFilterPopup(e, colId);
        };
    });
}

function autoFitTextColumn(colId) {
    // 공백이나 특수문자가 포함된 ID를 위한 escape 처리
    const safeId = CSS.escape(colId);
    document.querySelectorAll(`.grid-cell[data-col-id="${safeId}"] .text-shrink`).forEach(el => {
        let fs = 13;
        el.style.fontSize = fs + 'px';
        const p = el.closest('.grid-cell');
        if (!p) return;
        const limit = p.classList.contains('header') ? p.clientWidth - 30 : p.clientWidth - 10;
        
        let safety = 0;
        while (el.scrollWidth > limit && fs > 5 && safety < 20) {
            fs -= 1;
            el.style.fontSize = fs + 'px';
            safety++;
        }
    });
}

function autoFitTextAll() {
    COLUMNS.forEach(col => autoFitTextColumn(col.id));
}

function attachResizerEvents() {
    document.querySelectorAll('.resizer').forEach(res => {
        res.onmousedown = (e) => {
            e.preventDefault();
            const cell = res.parentElement;
            const startX = e.pageX;
            const startW = cell.offsetWidth;
            const id = cell.dataset.colId;
            document.body.classList.add('resizing');
            
            const move = (me) => {
                const w = Math.max(10, startW + (me.pageX - startX)) + 'px';
                const safeVarName = id.replace(/[^a-zA-Z0-9]/g, '_');
                document.documentElement.style.setProperty(`--col-${safeVarName}-w`, w);
                state.columnWidths[id] = w;
                autoFitTextColumn(id);
            };
            const up = () => {
                localStorage.setItem('columnWidths', JSON.stringify(state.columnWidths));
                document.body.classList.remove('resizing');
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
            };
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
        };
    });
}

function attachRowEvents() {
    document.querySelectorAll('.grid-row').forEach(row => {
        row.onclick = () => {
            document.querySelectorAll('.grid-row').forEach(r => r.style.background = '');
            row.style.background = 'var(--row-selected-bg)';
            state.selectedRowId = row.dataset.id;
        };
    });
}

function showError(msg) {
    const b = document.getElementById('grid-body');
    if (b) b.innerHTML = `<div style="padding:50px; color:#ff4444; text-align:center;">${msg}</div>`;
}

window.toggleRowConfirm = async (e, rid) => {
    e.stopPropagation(); 
    const item = state.data.find(d => d.id === rid);
    if (!item) return;

    const currentStatus = !!(item.confirmed_date && item.confirmed_date.trim());
    const nv = currentStatus ? '' : 'V';
    
    // 1. 낙관적 UI 업데이트
    const rowEl = document.querySelector(`.grid-row[data-id="${rid}"]`);
    if (rowEl) {
        rowEl.classList.toggle('confirmed', !currentStatus);
        const cb = rowEl.querySelector('.confirmed-checkbox');
        if (cb) cb.checked = !currentStatus;
        
        // 로컬 상태 즉시 수정 (다음 클릭 시 currentStatus가 올바르게 계산되도록)
        item.confirmed_date = nv;
    }

    try {
        // 2. 서버 업데이트
        const { error } = await supabase.from('instructions').update({ confirmed_date: nv }).eq('id', rid);
        if (error) throw error;
    } catch (err) {
        // 실패 시 복구
        await fetchData(); 
        showError('상태 업데이트 실패');
    }
};

window.openInlineEditor = (cell, rid, cid, isExtra) => {
    if (cell.querySelector('.inline-editor')) return;
    const inner = cell.querySelector('.cell-inner');
    const textEl = inner ? inner.querySelector('.text-shrink') : null;
    const cur = state.data.find(r => r.id === rid);
    
    const val = isExtra 
        ? (cur && cur.extra_data ? (cur.extra_data[cid] || '') : '')
        : (cur ? (cur[cid] || '') : '');
    
    // 현재 실제 화면에 보이는 글자 크기를 그대로 추출
    let currentFontSize = '13px';
    if (textEl) {
        currentFontSize = window.getComputedStyle(textEl).fontSize;
    }
    
    if (inner) inner.style.visibility = 'hidden';
    
    const input = document.createElement('input');
    input.className = 'inline-editor';
    input.value = val;
    input.style.fontSize = currentFontSize; // 추출한 크기 즉시 적용
    
    cell.appendChild(input);
    input.focus();
    
    const save = async () => {
        const nv = input.value;
        if (nv !== val) {
            if (isExtra) {
                const updatedExtra = { ...(cur.extra_data || {}), [cid]: nv };
                await supabase.from('instructions').update({ extra_data: updatedExtra }).eq('id', rid);
            } else {
                await supabase.from('instructions').update({ [cid]: nv }).eq('id', rid);
            }
            fetchData();
        } else { 
            input.remove(); 
            if (inner) inner.style.visibility = 'visible';
            autoFitTextColumn(cid); 
        }
    };
    input.onkeydown = (e) => { 
        if (e.key === 'Enter') save(); 
        if (e.key === 'Escape') { 
            input.remove(); 
            if (inner) inner.style.visibility = 'visible';
            autoFitTextColumn(cid); 
        } 
    };
    input.onblur = save;
};

function openFilterPopup(e, cid) {
    closeAllPopups();
    state.currentFilterCol = cid;
    
    const vals = [...new Set(state.data.map(item => String(item[cid] || '').trim()))].sort();
    const set = state.activeFilters[cid] || new Set();
    const pop = document.createElement('div');
    pop.className = 'filter-popup';
    
    let h = `
        <div style="border-bottom:1px solid #333; padding-bottom:8px; margin-bottom:5px;">
            <label style="cursor:pointer;"><input type="checkbox" id="f-all" ${set.size === 0 ? 'checked' : ''} onchange="toggleAllCheckboxes(this.checked)"> 전체 선택</label>
        </div>
        <div class="filter-list-container">`; // 커스텀 스크롤바 클래스 적용
        
    vals.forEach(v => {
        const chk = set.size === 0 || set.has(v);
        h += `<div><label style="cursor:pointer; display:block; padding:2px 0;"><input type="checkbox" class="f-chk" data-value="${v}" ${chk ? 'checked' : ''}> ${v || '(빈값)'}</label></div>`;
    });
    
    h += `</div><button class="btn-primary" style="width:100%; margin-top:5px;" onclick="applyCheckedFilters('${cid}')">필터 적용</button>`;
    pop.innerHTML = h;
    document.body.appendChild(pop);
    
    const r = e.target.getBoundingClientRect();
    pop.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
    pop.style.top = (r.bottom + 8) + 'px';
}

window.toggleAllCheckboxes = (c) => document.querySelectorAll('.f-chk').forEach(cb => cb.checked = c);
window.applyCheckedFilters = (cid) => {
    const chks = document.querySelectorAll('.f-chk');
    const all = document.getElementById('f-all').checked;
    if (all) delete state.activeFilters[cid];
    else {
        const sel = new Set();
        chks.forEach(cb => { if (cb.checked) sel.add(cb.dataset.value); });
        state.activeFilters[cid] = sel;
    }
    closeAllPopups();
    applyFilters();
};

function closeAllPopups() { 
    document.querySelectorAll('.filter-popup').forEach(p => p.remove()); 
    state.currentFilterCol = null; // 초기화
}
