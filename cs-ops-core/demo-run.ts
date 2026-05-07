// cs-ops-core/demo-run.ts
// Phase4_Demo — run 6 end-to-end scenarios via process_cs_message
import { process_cs_message } from './src/pipeline';

const SCENARIOS = [
  {
    id: 'demo-1',
    label: '배송 조회 → 자동 응답',
    message: '주문 12345 배송 상태가 어떻게 되나요? 오늘 도착하나요?',
  },
  {
    id: 'demo-2',
    label: '환불 가능 케이스 → 초안 생성',
    message: '주문번호 11111 단순 변심으로 반품하고 싶어요. 아직 포장 안 뜯었어요.',
  },
  {
    id: 'demo-3',
    label: '환불 거절 위험 → human review',
    message: '두 달 전에 구매한 제품인데 불량이에요. 환불 안 해주면 소비자원 신고하겠습니다.',
  },
  {
    id: 'demo-4',
    label: '개인정보 삭제 요청 → escalation',
    message: '제 모든 개인정보를 삭제해주세요. GDPR 권리를 요청합니다.',
  },
  {
    id: 'demo-5',
    label: '구독 취소 → 정책 매칭',
    message: '멤버십 구독을 해지하고 싶어요. 이번 달 결제가 됐는데 환불도 가능한가요?',
  },
  {
    id: 'demo-6',
    label: '불명확 문의 → general_inquiry',
    message: '안녕하세요, 영업시간이 어떻게 되나요?',
  },
];

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Phase4_Demo — CS Ops Harness End-to-End Run');
  console.log('══════════════════════════════════════════════════\n');

  let passed = 0;
  for (const s of SCENARIOS) {
    console.log(`[${s.id}] ${s.label}`);
    console.log(`  Input: "${s.message.slice(0, 60)}..."`);

    const result = await process_cs_message(s.message, `demo-ts-${Date.now()}`);

    if (result.ok) {
      const run = result.value;
      console.log(`  ✅ phase=${run.phase}  action=${run.risk_decision.action}  evidence=${run.evidence_ids.length}`);
      console.log(`     reason: ${run.risk_decision.reason.slice(0, 80)}`);
      if (run.final_answer) {
        console.log(`     draft: "${run.final_answer.slice(0, 80)}..."`);
      }
      passed++;
    } else {
      console.log(`  ❌ FAIL at step=${result.step}: ${result.error}`);
    }
    console.log();
  }

  console.log(`══════════════════════════════════════════════════`);
  console.log(`  Result: ${passed}/${SCENARIOS.length} scenarios completed`);
  console.log(`══════════════════════════════════════════════════\n`);
}

main().catch(console.error);
