const fs = require('fs');
const XLSX = require('xlsx');
const chokidar = require('chokidar');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mntkqjglpzkhokbfpjcl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udGtxamdscHpraG9rYmZwamNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDAwNjMsImV4cCI6MjA5NDE3NjA2M30.CeOFhlNX-Vi44toM5tpxAlxZLaNrkbv-XlXbtwkpJZU';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EXCEL_PATH = "G:\\내 드라이브\\3. 제조지시서 EXCEL_PDF\\제조지시서_취합.xlsx";

// 실시간 상태 전송 채널
const statusChannel = supabase.channel('sync-status');

async function sendStatus(msg, isSyncing = false) {
    try {
        await statusChannel.send({
            type: 'broadcast',
            event: 'status',
            payload: { message: msg, isSyncing: isSyncing, timestamp: new Date().toLocaleTimeString() }
        });
    } catch (e) {
        // 무시
    }
}

function formatDateMMDD(val) {
    if (!val) return '';
    let d;
    
    if (val instanceof Date) {
        d = val;
    } else {
        let num = Number(val);
        if (!isNaN(num) && num > 30000) { 
            // 엑셀 시리얼 -> JS 날짜 (오차 방지를 위해 Math.round 사용)
            d = new Date(Math.round((num - 25569) * 86400 * 1000));
        } else {
            d = new Date(val);
        }
    }
    
    if (isNaN(d.getTime())) return String(val).trim();
    
    // 엑셀 날짜는 정각(00:00:00) 기준인 경우가 많으므로, 
    // 시간대 오차로 인한 날짜 바뀜을 방지하기 위해 12시간을 더해 안전하게 추출
    const safeDate = new Date(d.getTime() + (d.getTimezoneOffset() * 60000) + (12 * 60 * 60 * 1000));
    
    const m = String(safeDate.getMonth() + 1).padStart(2, '0');
    const day = String(safeDate.getDate()).padStart(2, '0');
    return `${m}${day}`;
}

async function syncExcel() {
    console.log(`\n[${new Date().toLocaleTimeString()}] 🚀 동기화 시작...`);
    await sendStatus('동기화 중...', true);

    try {
        if (!fs.existsSync(EXCEL_PATH)) {
            await sendStatus('파일 없음');
            return;
        }

        const workbook = XLSX.readFile(EXCEL_PATH, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);

        await supabase.from('instructions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        const CORE_MAP = {
            '번호': 'item_no',
            '제작명': 'product_name',
            '제조번호': 'instruction_no',
            '품명': 'item_name',
            '규격/도번': 'spec',
            '재질': 'material',
            '소재': 'base_material',
            '자재수': 'quantity',
            '비고': 'remarks',
            '발주': 'order_date',
            '업체': 'company',
            '확인': 'confirmed_date',
            '확인일자': 'confirmed_date'
        };

        const rows = json.map(item => {
            const rowData = { extra_data: {} };
            
            // 모든 엑셀 항목 순회
            Object.keys(item).forEach(key => {
                const cleanKey = key.trim();
                const dbCol = CORE_MAP[cleanKey];
                
                let val = item[key];
                if (cleanKey === '발주' || cleanKey === '확인일자') {
                    val = formatDateMMDD(val);
                } else {
                    val = String(val ?? '').trim();
                }

                if (dbCol) {
                    rowData[dbCol] = val;
                } else {
                    // Core에 없는 열은 extra_data에 저장
                    rowData.extra_data[cleanKey] = val;
                }
            });

            return rowData;
        });

        const { error } = await supabase.from('instructions').insert(rows);
        
        if (error) {
            await sendStatus('동기화 실패');
            console.error('❌ 동기화 실패:', error.message);
        } else {
            await sendStatus(`최근 동기화: ${new Date().toLocaleTimeString()}`, false);
            console.log(`✅ 동기화 완료! (${rows.length}건)`);
        }

    } catch (err) {
        await sendStatus('에러 발생');
        console.error('❌ 에러:', err.message);
    }
}

// 채널 구독 후 시작
statusChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
        console.log('📡 실시간 상태 채널 연결 완료');
        await sendStatus('에이전트 연결됨', false);
        await syncExcel();
        
        // 실시간 감시 시작
        const watcher = chokidar.watch(EXCEL_PATH, {
            persistent: true,
            usePolling: true,
            interval: 500,
            binaryInterval: 1000,
            awaitWriteFinish: {
                stabilityThreshold: 1000,
                pollInterval: 100
            }
        });

        watcher.on('change', path => {
            console.log(`\n[${new Date().toLocaleTimeString()}] 📝 엑셀 변경 감지!`);
            syncExcel();
        });
    }
});

console.log('🤖 HANKOOK 실시간 싱크 에이전트 대기 중...');
