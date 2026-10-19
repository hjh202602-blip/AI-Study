/*
 * 보물지도 설정 파일
 * ------------------------------------------------------------
 * 지도 한 장 = 목차 파일(.md) 하나. 기본은 저장소 루트의 README.md.
 *   ### 00. 제목        → 지도의 섬(챕터) 하나
 *   - [01. 제목](x.md)  → 섬 위의 지점 하나, 적힌 순서대로 보물길이 이어짐
 *   > [02+. 제목](x.md) → 바로 앞 지점에 딸린 곁가지 지점(야영지)
 *   #### 실습 예제 아래의 링크 → 섬의 실습 파일 목록 (사이트에서 바로 실행 가능)
 *
 * 지도 제목은 섬 이름을 이어서 자동으로 만든다 (예: 파이썬 × 퍼셉트론 × 신경망).
 * 새 개념 묶음은 목차 파일을 하나 더 만들고 아래 maps 에 한 줄 추가하면
 * 화면 옆에 돌돌 말린 지도로 나타난다.
 */
window.AIMAP_CONFIG = {
  // 깃허브 저장소 (GitHub Pages나 파일로 열었을 때 이 저장소에서 .md를 읽어 온다)
  repo: { owner: 'hjh202602-blip', name: 'AI-Study', branch: 'main' },

  // 본문이 이 글자 수보다 짧으면 "미개척"(?)으로 표시
  draftThreshold: 40,

  maps: [
    {
      id: 'nn',
      source: 'README.md',          // 목차 파일 (저장소 루트 기준 경로)
      // title: '직접 정한 제목',    // 없으면 섬 이름을 이어서 자동으로 만든다
      subtitle: '밑바닥부터 시작하는 딥러닝 1 · 공부 노트',
      // repo: { owner, name, branch } 다른 저장소의 목차를 쓸 때만

      // 섬(챕터) 꾸미기. 키는 README "### 00." 의 번호
      regions: {
        '00': { name: '파이썬', en: 'PYTHON', desc: '신경망 계산을 위한 도구 상자' },
        '01': { name: '퍼셉트론', en: 'PERCEPTRON', desc: '신호를 받아 0 또는 1을 내보내는 가장 작은 뉴런' },
        '02': { name: '신경망', en: 'NEURAL NET', desc: '퍼셉트론을 이어 붙여 만든 인공 신경망' },
      },

      // 지점(개념) 꾸미기. 키는 .md 파일 이름(확장자 제외)
      //   mark    : 지도에 찍을 표시
      //             'clue'     단서(🔑) — 꼭 알아야 할 핵심 개념에만
      //             'area'     구역   — 곁가지까지 묶어서 점선 구역으로 표시
      //             'flag'     표지   — 보통 지점 (기본값)
      //             'camp'     야영지 — 곁가지 지점 (곁가지 기본값)
      //   label   : 지도에 보일 이름
      //   en      : 영어 부제
      //   summary : 한 줄 요약 (패널 맨 위)
      //   widgets : 패널 맨 위에 붙일 시각화 (js/widgets.js 에 등록된 이름)
      //   refs    : 참고자료 링크 [{ title, url, desc }] — 패널 아래쪽에 카드로 나온다
      // .md 본문 안에 <!-- widget: 이름 --> 을 적으면 그 자리에 시각화가 들어간다.
      nodes: {
        '00-01python': {
          mark: 'flag', label: '파이썬 · NumPy', en: 'PYTHON BASICS',
          summary: 'NumPy로 계산하고 Matplotlib으로 그린다.',
          widgets: ['sinPlot'],
        },
        '01-01perceptron': {
          mark: 'clue', label: '퍼셉트론', en: 'PERCEPTRON',
          summary: '입력 × 가중치를 더해서 임계값을 넘으면 1, 아니면 0.',
          widgets: ['perceptron'],
        },
        '01-02gate': {
          mark: 'area', label: '논리 게이트', en: 'LOGIC GATE',
          summary: '가중치와 임계값만 바꾸면 같은 퍼셉트론이 AND도, OR도 된다.',
          widgets: ['gateFit'],
        },
        '01-02gate+': {
          mark: 'camp', label: '게이트 더 보기', en: 'GATES+',
          summary: 'NOT · AND · OR · XOR 과 NAND · NOR · XNOR 의 진리표.',
          widgets: ['gateBoard'],
        },
        '01-03python구현': {
          mark: 'flag', label: '파이썬 구현', en: 'IMPLEMENT',
          summary: '임계값 θ를 편향 b로 바꾸면 식이 "0보다 크냐"로 단순해진다.',
          widgets: ['numpyStep'],
        },
        '01-04한계': {
          mark: 'clue', label: 'XOR 문제', en: 'LIMIT OF SLP',
          summary: '단층 퍼셉트론은 직선 하나. XOR은 직선 하나로 못 나눈다.',
          widgets: ['boundary'],
          refs: [
            { title: 'TensorFlow Playground', url: 'https://playground.tensorflow.org/', desc: '데이터를 XOR(체크무늬)로 고르고 은닉층을 0개로 두면, 직선 하나로는 나뉘지 않는 걸 직접 볼 수 있어요.' },
          ],
        },
        '01-05MLP': {
          mark: 'clue', label: '다층 퍼셉트론', en: 'MLP',
          summary: '직선 하나로 안 되면 둘을 쓰자. NAND + OR → AND = XOR.',
          widgets: ['xorNet'],
          refs: [
            { title: 'TensorFlow Playground', url: 'https://playground.tensorflow.org/', desc: '은닉층과 뉴런을 늘려 가며 XOR 같은 데이터가 어떻게 나뉘는지 브라우저에서 직접 학습시켜 보는 도구예요.' },
          ],
        },
        '02-00ANN': {
          label: 'ANN', en: 'ARTIFICIAL NEURAL NET',
        },
      },

      // ✕ 보물 문제
      //   questions: 섬마다의 문제. about(관련 지점 .md 이름)이 속한 섬의 ✕ 에 자동으로 들어간다.
      //   final    : 마지막 보물섬의 최종 문제 (이 단원 전체). 없으면 questions 전체를 쓴다.
      //   type  : 'choice' (보기 고르기) | 'number' (숫자 입력)
      //   answer: choice 는 정답 보기의 번호(0부터), number 는 정답 숫자
      quiz: {
        title: '퍼셉트론 단원의 최종 보물',
        reward: '',   // 최종 보물을 열었을 때 보여 줄 보상 (아직 정하지 않음)
        questions: [
          {
            type: 'number', about: '00-01python',
            q: 'x = np.arange(0, 20, 0.1) 로 만든 배열 x 에는 원소가 몇 개 있을까?',
            answer: 200,
            explain: '0부터 20 직전까지 0.1 간격이니 0, 0.1, …, 19.9 — 모두 200개예요.',
          },
          {
            type: 'choice', about: '01-01perceptron',
            q: '퍼셉트론에서 임계값 θ는 어떤 역할을 할까?',
            options: ['입력값의 개수를 정한다', '가중합이 이 값을 넘으면 1, 아니면 0을 내보내는 기준이다', '가중치를 자동으로 학습한다', '출력을 항상 0으로 만든다'],
            answer: 1,
            explain: 'w₁x₁ + w₂x₂ 가 θ보다 크면 1, 작거나 같으면 0을 출력해요.',
          },
          {
            type: 'number', about: '01-01perceptron',
            q: 'w₁ = 0.5, w₂ = 0.5, θ = 0.7 일 때 입력 (x₁, x₂) = (1, 1) 의 출력 y는?',
            answer: 1,
            explain: '0.5×1 + 0.5×1 = 1.0 이고, 1.0 > 0.7 이라서 y = 1 이에요.',
          },
          {
            type: 'choice', about: '01-02gate',
            q: '(w₁, w₂, θ) = (0.2, 0.3, 0.4) 인 퍼셉트론은 어떤 게이트처럼 동작할까?',
            options: ['AND', 'OR', 'NAND', 'XOR'],
            answer: 0,
            explain: '(1, 1)일 때만 0.5 > 0.4 가 되어 1을 출력해요. 모두 1일 때만 1 → AND 예요.',
          },
          {
            type: 'choice', about: '01-02gate',
            q: 'AND 게이트를 만든 퍼셉트론에서 무엇을 바꾸면 NAND 게이트가 될까?',
            options: ['입력의 개수', '매개변수(가중치와 임계값)의 부호', '출력층의 개수', '아무것도 바꿀 필요 없다'],
            answer: 1,
            explain: 'NAND는 AND의 매개변수 부호만 반대로 하면 돼요. 같은 퍼셉트론, 다른 매개변수!',
          },
          {
            type: 'choice', about: '01-03python구현',
            q: '임계값 θ를 편향 b로 바꿔 쓸 때, b와 θ의 관계는?',
            options: ['b = θ', 'b = −θ', 'b = 1/θ', 'b = θ²'],
            answer: 1,
            explain: 'w₁x₁ + w₂x₂ > θ 를 이항하면 w₁x₁ + w₂x₂ − θ > 0, 그래서 b = −θ 예요.',
          },
          {
            type: 'number', about: '01-03python구현',
            q: 'x = np.array([1, 0]), w = np.array([0.2, 0.3]) 일 때 np.sum(x*w) 의 값은?',
            answer: 0.2,
            explain: 'x*w = [1×0.2, 0×0.3] = [0.2, 0] 이고, 모두 더하면 0.2 예요.',
          },
          {
            type: 'choice', about: '01-04한계',
            q: '단층 퍼셉트론으로 XOR 게이트를 만들 수 없는 이유는?',
            options: ['입력이 두 개뿐이라서', '가중치가 음수가 될 수 없어서', '직선 하나로는 0과 1의 영역을 나눌 수 없어서', '파이썬으로는 구현할 수 없어서'],
            answer: 2,
            explain: '단층 퍼셉트론의 경계는 직선이에요. XOR의 1은 대각선으로 마주 보고 있어서 직선 하나로 못 나눠요.',
          },
          {
            type: 'choice', about: '01-05MLP',
            q: '다층 퍼셉트론으로 XOR을 만드는 방법은?',
            options: ['AND의 출력을 OR에 넣는다', 'NAND와 OR의 출력을 AND에 넣는다', 'NOT을 두 번 연결한다', 'OR만 여러 개 쌓는다'],
            answer: 1,
            explain: 's₁ = NAND(x₁, x₂), s₂ = OR(x₁, x₂), y = AND(s₁, s₂) — 직선 두 개가 만든 띠가 XOR이에요.',
          },
          {
            type: 'choice', about: '01-05MLP',
            q: '다층 퍼셉트론에서 입력층과 출력층 사이, 연산을 하는 층의 이름은?',
            options: ['입력층', '은닉층', '출력층', '편향층'],
            answer: 1,
            explain: '은닉층은 여러 개의 단층 퍼셉트론을 겹친 층이고, 층이 많을수록 복잡한 패턴을 표현할 수 있어요.',
          },
        ],
        final: [
          {
            type: 'choice', about: '01-04한계',
            q: '단층 퍼셉트론 하나로는 만들 수 없는 게이트는?',
            options: ['AND', 'OR', 'NAND', 'XOR'],
            answer: 3,
            explain: 'AND·OR·NAND는 직선 하나로 나뉘지만 XOR은 안 돼요. 그래서 층을 쌓아야 해요.',
          },
          {
            type: 'number', about: '01-03python구현',
            q: 'x = [1, 1], w = [0.5, 0.5], b = −0.7 일 때 np.sum(x*w) + b 의 값은?',
            answer: 0.3,
            explain: '0.5 + 0.5 − 0.7 = 0.3 이고, 0보다 크니 출력은 1이에요 (AND 게이트).',
          },
          {
            type: 'choice', about: '01-01perceptron',
            q: '다음 중 퍼셉트론의 "매개변수"가 아닌 것은?',
            options: ['가중치 w', '편향 b', '임계값 θ', '입력 x'],
            answer: 3,
            explain: '매개변수는 우리가 정하는 값(가중치·편향·임계값)이에요. 입력 x는 바깥에서 들어오는 데이터예요.',
          },
          {
            type: 'choice', about: '01-05MLP',
            q: '직선 하나로 나눌 수 없는 문제를 풀려면 어떻게 해야 할까?',
            options: ['입력의 개수를 늘린다', '가중치를 아주 크게 한다', '퍼셉트론을 여러 층으로 쌓는다', '임계값을 0으로 둔다'],
            answer: 2,
            explain: '다층 퍼셉트론은 여러 직선을 조합해서 곡선이나 띠 같은 비선형 경계를 만들 수 있어요.',
          },
          {
            type: 'choice', about: '00-01python',
            q: '신경망 계산에서 행렬·벡터 연산에 주로 쓰는 파이썬 라이브러리는?',
            options: ['Matplotlib', 'NumPy', 'random', 'os'],
            answer: 1,
            explain: 'NumPy는 배열(행렬) 계산을, Matplotlib은 그래프 그리기를 맡아요.',
          },
        ],
      },
    },

    // 다음 개념 묶음 자리 — 목차 파일을 만들면 이렇게 바꾸면 된다:
    //   { id: 'cnn', source: 'cnn/README.md', subtitle: '...' },
    // 테스트용 빈 지도 — 실제 지도를 추가하면 지우면 된다
    //   path: 섬을 잇는 순서 모양 'ㄹ' | 'Z' | 'ㄷ' | 'ㄱ' | 'ㄴ' 을 직접 고를 수도 있다 (없으면 지도마다 무작위)
    { id: 'empty1', placeholder: true, title: '빈 지도 1' },
    { id: 'empty2', placeholder: true, title: '빈 지도 2' },
    { id: 'empty3', placeholder: true, title: '빈 지도 3' },
    { id: 'empty4', placeholder: true, title: '빈 지도 4' },
    { id: 'empty5', placeholder: true, title: '빈 지도 5' },
  ],
};
