import pyautogui as py
import time

x1,y1=10,10
x2,y2=500,500
k1,k2=5,6
a3 = ((k1 + k2) * (x1 - x2) - 2 * y1 + 2 * y2) / ((x1 - x2) ** 3)
a2 = (-k1 * (x1 - x2) * (x1 + 2 * x2) + k2 * (-2 * x1**2 + x1 * x2 + x2**2) + 3 * (x1 + x2) * (y1 - y2)) / ((x1 - x2) ** 3)
a1 = (k2 * x1 * (x1 - x2) * (x1 + 2 * x2) - x2 * (k1 * (-2 * x1**2 + x1 * x2 + x2**2) + 6 * x1 * (y1 - y2))) / ((x1 - x2) ** 3)
a0 = (x2 * (x1 * (-x1 + x2) * (k2 * x1 + k1 * x2) - x2 * (-3 * x1 + x2) * y1) + x1**2 * (x1 - 3 * x2) * y2) / ((x1 - x2) ** 3)

Xlst=[]
Ylst=[]

for i in range(x1,x2,int(x2/x1)):
	x_1=i
	x_2=i**2
	x_3=i**3
	y=int(((a3*x_3)+(a2*x_2)+(a1*x_1)+a0))
	Xlst.append(i)
	Ylst.append(y)

for x,y in zip(Xlst,Ylst):
	py.moveTo(x,y)
