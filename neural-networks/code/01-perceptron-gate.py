import matplotlib.pyplot as plt
import numpy as np

x=np.array([
    [0,0],
    [0,1],
    [1,0],
    [1,1]
])

def draw_gate(w,b,title,filename):
    plt.figure(figsize=(5,5))
    y=[]
    for x1,x2 in x:
        tmp=w[0]*x1+w[1]*x2+b
        y.append(1 if tmp>0 else 0)
    for (x1,x2),out in zip(x,y):
        if out==1:
            plt.scatter(x1,x2,s=200,marker='o')
        else:
            plt.scatter(x1,x2,s=200,marker='x')
    xs=np.linspace(-0.2,1.2,100)
    if w[1]!=0:
        ys=-(w[0]*xs+b)/w[1]
        plt.plot(xs,ys)

    plt.xlim(-0.2,1.2)
    plt.ylim(-0.2,1.2)
    plt.xlabel("x1")
    plt.ylabel("x2")
    plt.title(title)
    plt.grid(True)

    plt.savefig(filename,bbox_inches="tight")
    plt.close()

draw_gate([0.5,0.5],-0.7,"AND Gate","and_gate.png")
draw_gate([-0.5,-0.5],0.7,"NAND Gate","nand_gate.png")
draw_gate([0.5,0.5],-0.2,"OR Gate","or_gate.png")
