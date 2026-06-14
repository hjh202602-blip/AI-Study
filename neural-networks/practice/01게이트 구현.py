import numpy as np

x=np.array([0,0]) #입력
w=np.array([0.5,0.5]) #가중치

#AND
def AND(x,w,b):
    return 1 if(np.sum(x*w)+b > 0) else 0

#NAND
def NAND(x,w,b):
    return 1 - AND(x,w,b)

#OR
def OR(x,w,b):
    return 1 if(np.sum(x*w)+b > 0) else 0

#NOR
def NOR(x,w,b):
    return 1 - OR(x,w,b)

#XOR
def XOR(x,w,b):
    s1=NAND(x,w,-0.7)
    s2=OR(x,w,b)
    return AND(np.array([s1,s2]),w,b)

#print sum
def print_sum(func,w,b):
    print(f"{func.__name__}(0, 0):\t{func(np.array([0,0]),w,b)}")
    print(f"{func.__name__}(1, 0):\t{func(np.array([1,0]),w,b)}")
    print(f"{func.__name__}(0, 1):\t{func(np.array([0,1]),w,b)}")
    print(f"{func.__name__}(1, 1):\t{func(np.array([1,1]),w,b)}\n")

print_sum(AND,w,-0.7)
print_sum(NAND,w,-0.7)
print_sum(OR,w,-0.2)
print_sum(NOR,w,-0.2)
print_sum(XOR,w,-0.2)