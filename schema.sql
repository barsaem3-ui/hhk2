-- 1. 제조지시서 메인 테이블
CREATE TABLE IF NOT EXISTS instructions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name TEXT NOT NULL, -- 제작명
    instruction_no TEXT NOT NULL UNIQUE, -- 제조지시번호
    order_no TEXT, -- 주문번호
    due_date DATE, -- 납기일자
    order_date DATE, -- 발주일자
    company TEXT, -- 업체
    is_confirmed BOOLEAN DEFAULT FALSE, -- 확인상자
    schedule TEXT, -- 일정 (추가)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 제품제조상세내역 테이블
CREATE TABLE IF NOT EXISTS instruction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instruction_id UUID REFERENCES instructions(id) ON DELETE CASCADE,
    item_no INTEGER, -- 번호
    item_name TEXT, -- 품명
    spec TEXT, -- 규격/도번
    material TEXT, -- 재질
    quantity INTEGER, -- 수량
    consumption TEXT, -- 소요량 (추가)
    base_material TEXT, -- 소재
    raw_material_qty TEXT, -- 원자재수량
    remarks TEXT, -- 비고
    extra_data JSONB -- 소요량 이후 기타 항목 저장 (PCL, 제품크기 제외)
);

-- 3. 댓글 테이블
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instruction_id UUID REFERENCES instructions(id) ON DELETE CASCADE,
    user_email TEXT DEFAULT 'barsaem3@gmail.com',
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 설정 (보안)
ALTER TABLE instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 누구나 읽고 쓸 수 있도록 정책 설정 (개발 단계용)
-- 실제 배포 시에는 특정 사용자만 허용하도록 조정 필요
CREATE POLICY "Enable all for everyone" ON instructions FOR ALL USING (true);
CREATE POLICY "Enable all for everyone" ON instruction_items FOR ALL USING (true);
CREATE POLICY "Enable all for everyone" ON comments FOR ALL USING (true);
