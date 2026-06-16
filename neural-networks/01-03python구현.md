# 01 퍼셉트론 (perceptron)

## 3. python으로 구현하기

입력($x_1$, $x_2$)을 인수로 받는AND게이트 함수를 만들어 보자.

```py
def AND(x1, x2):
  w1, w2, theta = 0.2, 0.3, 0.4 #다른 값을 사용가능
  tmp = x1*w1 + x2*w2
  if tmp <= theta:
    return 0
  else:
    return 1
```

출력

```
AND(0, 0) #0출력
AND(1, 0) #0출력
AND(0, 1) #0출력
AND(1, 1) #1출력
```

---

### 다른 방식

$\theta$(임계값)을 -b(편향)으로 취환하자. 그리고 식을 이항하면, 

$$
y =
\begin{cases}
0 & (w_1x_1 + w_2x_2  + b \le 0) \\
1 & (w_1x_1 + w_2x_2 + b > 0)
\end{cases}
$$

이 식은 입력 신호와 가중치의 곲에서 편향(bias)를 합하여, 0을 넘으면 1, 아니면 0이 된다. 이 식과 numpy배열을 이용해서 코드를 짜보자

```py
import numpy as np

def AND(x1, x2):
  x = np.array([x1, x2])
  w = np.array([0.2, 0.3])
  b = -0.4
  tmp = np.sum(x*w) + b
  if tmp <= 0:
    return 0
  else:
    return 1
```

<details>
<summary>numpy문법(클릭하기)</summary>

`np.array`는 여러 데이터를 Numpy 배열(Array)로 생성하는 함수이다.

numpy에서 두 배열의 곲 `x*w`는 같은 위치의 원소끼리 곱한다.

```
x*w
= [1, 0] * [0.2, 0.3]
= [1*0.2, 0*0.3]
= [0.2, 0]
```

`np.sum`은 모든 원소값을 더하는 함수이다.

```
np.sum(x*w)
= np.sum([0.2, 0])
--> 0.2
```

</details>

이 코드에서 w와 b만 다르게 하면, NAND게이트와 OR게이트 구현도 가능하다. 직접 구현해보자

<details>
<summary>NAND, OR게이트</summary>

NAND게이트

```py
def NAND(x1, x2):
  x = np.array([x1, x2])
  w = np.array([-0.2, -0.3])
  b = 0.4
  tmp = np.sum(x*w) + b
  if tmp <= 0:
    return 0
  else:
    return 1
```

OR게이트

```py
def OR(x1, x2):
  x = np.array([x1, x2])
  w = np.array([0.3, 0.3])
  b = -0.2
  tmp = np.sum(x*w) + b
  if tmp <= 0:
    return 0
  else:
    return 1
```

NAND, OR게이트 모두 AND게이트에서 b와 w만 변경되었다.

</details>

그럼 XOR게이트는 어떻게 구현할까?

---

[돌아가기(README)](../README.md)

[이전(gate)](01-02gate.md)

[다음(한계)](01-04한계.md)