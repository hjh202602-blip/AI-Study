'''
다층 퍼셉트론 - 만점 예측
입력 4개(충분한 수면, 기출 문제 풀이, 매일 공부, 수업에 졸지 않음) 중,
3개 이상이 1(yes)이면, 1 반환(만점 예측)

+ Step Fucntion 사용
'''

#식: w1*x1 + w2*x2 + w3*x3 + w4*x4 + w5*x5 + b

def logic(x1,x2,x3,x4):
    """ x1 : 충분한 수면을 했는가?
        x2 : 기출 문제를 풀었는가?
        x3 : 공부를 매일 했는가?
        x4 : 수업에 졸지 않았는가?] 각각 0(ㄴㄴ)또는 1(ㅇㅇ)
    이 4개중 3개 이상이 1이 나오면 1반환"""

    #AND 연산
    def AND(x1,x2):
        w=0.3 #가중치 설정
        b=-0.5 #편향 설정
        return 1 if(x1*w+x2*w+b>0) else 0
    #OR 연산
    def OR(x1,x2):
        w=0.3 #가중치 설정
        b=-0.2 #편향 설정
        return 1 if(x1*w+x2*w+b>0) else 0
    
    #은닉층 1층: 3가지 이상의 1 조합 찾기
    f1=AND(x1,AND(x2,x3)) #노드1
    f2=AND(x2,AND(x3,x4)) #노드2
    f3=AND(x3,AND(x4,x1)) #노드3
    f4=AND(x4,AND(x1,x2)) #노드4

    #은닉층 2층: 위 조합 중 하나라도 1이면 1반환
    result=OR(OR(f1,f2),OR(f3,f4))

    #값 반환
    return result

#계ㅔㅔㅔ단 함수 step function
def logic2(x1,x2,x3,x4):
    w=0.2 #가중치 설정
    b=-0.5 #편향 설정
    return 1 if(x1*w+x2*w+x3*w+x4*w+b>0) else 0 #일정 값을 넘으면 1,아니면 0

x1=int(input("충분한 수면을 했는가?(yes:1/no:0): "))
x2=int(input("기출 문제를 풀었는가?(yes:1/no:0): "))
x3=int(input("공부를 매일 했는가?(yes:1/no:0): "))
x4=int(input("수업에 졸지 않았는가?(yes:1/no:0): "))
print("다층 퍼셉트론")
print(f"결과 (3개 충족 시): {"만점" if(logic(x1,x2,x3,x4)==1) else "만점 아님"}")

print("활성화 함수(step function)")
print(f"결과 (3개 충족 시): {"만점" if(logic(x1,x2,x3,x4)==1) else "만점 아님"}")