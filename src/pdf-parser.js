import * as pdfjsLib from 'pdfjs-dist';

// Vite 환경에 맞는 로컬 워커 로드 방식
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function parseManufacturingPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const results = {
        instruction: { product_name: '', instruction_no: '', order_no: '', due_date: '' },
        items: []
    };

    let allTextItems = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const textContent = await page.getTextContent();
        
        allTextItems = allTextItems.concat(textContent.items.map(it => ({
            str: it.str.trim(),
            x: it.transform[4],
            y: viewport.height - it.transform[5],
            w: it.width
        })));
    }

    // 1. 헤더 정보 추출
    const findValue = (keywords) => {
        for (let i = 0; i < allTextItems.length; i++) {
            const cleanStr = allTextItems[i].str.replace(/\s/g, '');
            if (keywords.some(k => cleanStr.includes(k))) {
                for (let j = 1; j <= 8; j++) {
                    const next = allTextItems[i + j];
                    if (next && next.str.length > 1 && !keywords.some(k => next.str.includes(k))) return next.str;
                }
            }
        }
        return '';
    };

    results.instruction.product_name = findValue(['제작명', '품명']) || '분석실패';
    results.instruction.instruction_no = findValue(['제조지시번호', '지시번호']) || findValue(['번호']) || '미검출';
    results.instruction.order_no = findValue(['주문번호']);
    results.instruction.due_date = findValue(['납기일']);

    // 2. 상세 테이블 추출
    const rows = {};
    allTextItems.forEach(it => {
        if (!it.str) return;
        const rowY = Math.round(it.y / 15) * 15;
        if (!rows[rowY]) rows[rowY] = [];
        rows[rowY].push(it);
    });

    const sortedRowYs = Object.keys(rows).sort((a, b) => a - b);
    
    sortedRowYs.forEach(y => {
        const row = rows[y].sort((a, b) => a.x - b.x);
        const firstCol = row[0].str;
        
        if (/^[0-9]+(-[0-9]+)?$/.test(firstCol)) {
            const item = {
                product_name: results.instruction.product_name,
                instruction_no: results.instruction.instruction_no,
                part_name: row.length > 1 ? row[1].str : '',
                spec: row.length > 2 ? row[2].str : '',
                material: row.length > 3 ? row[3].str : '',
                quantity: row.length > 4 ? row[4].str : '0',
                remark: row.length > 5 ? row[row.length - 1].str : ''
            };
            results.items.push(item);
        }
    });

    return results;
}
