# x1*w1 + x2*w2 > theta

w1=float(input("w1: "))
w2=float(input("w2: "))
theta=float(input("theta: "))   
print("================================")

#print
def print_sum(func):
    print(f"{func.__name__}(0, 0): {func(0, 0, w1, w2, theta)}")
    print(f"{func.__name__}(1, 0): {func(1, 0, w1, w2, theta)}")
    print(f"{func.__name__}(0, 1): {func(0, 1, w1, w2, theta)}")
    print(f"{func.__name__}(1, 1): {func(1, 1, w1, w2, theta)}")

def func(x1,x2,w1,w2,theta):
    if x1*w1 + x2*w2 > theta:
        return 1
    else:
        return 0

print_sum(func)