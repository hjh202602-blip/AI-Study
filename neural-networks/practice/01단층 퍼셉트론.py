import numpy as np

#다층 퍼셉트론 계산 식
def logic_gate(x,w,b):
    #원래 식: x1*w1 + x2*w2 + ... + xn*wn + b (입력*가중치 + 편향)
    if np.sum(x*w) + b > 0:
        return 1
    else:
        return 0
    
#AND 게이트(모두 1일 때만 출력이 1)
def AND(x1,x2):
    w1,w2,b=0.5,0.5,-0.7 #가중치와 편향 설정
    return logic_gate(np.array([x1,x2]),np.array([w1,w2]),b)

#OR 게이트(하나라도 1이면 출력이 1)
def OR(x1,x2):
    w1,w2,b=0.5,0.5,-0.2
    return logic_gate(np.array([x1,x2]),np.array([w1,w2]),b)

#NOT 게이트(반대로 출력)
def NOT(x):
    return 1 if(x==0) else 0

#NAND 게이트(AND 반대)
def NAND(x1,x2):
    return NOT(AND(x1,x2))

#NOR 게이트(OR 반대)
def NOR(x1,x2):
    return NOT(OR(x1,x2))

#XOR 게이트(서로 다를 때만 1)
def XOR(x1,x2):
    return AND(NOT(AND(x1,x2)),OR(x1,x2)) #XOR게이트 -> nand + or

#모든 값 출력
def print_sum(func):
    print(f"{func.__name__}(0,0): {func(0,0)}")
    print(f"{func.__name__}(1,0): {func(1,0)}")
    print(f"{func.__name__}(0,1): {func(0,1)}")
    print(f"{func.__name__}(1,1): {func(1,1)}")

print("AND 게이트")
print_sum(AND)
print("OR 게이트")
print_sum(OR)
print("NAND 게이트")
print_sum(NAND)
print("NOR 게이트")
print_sum(NOR)
print("XOR 게이트")
print_sum(XOR)