import matplotlib.pyplot as plt
import pyautogui as py
import csv
import time

count=4

mouse_co=[['X','Y','TIME']]

x=[]
y=[]
ztime=[]
c=0
for i in range(2000):
	a=time.time()
	time.sleep(0.001)
	temp=[]
	mouse=py.position()
	b=time.time()
	c+=b-a
	ztime.append(c)
	temp.append(mouse.x)
	x.append(mouse.x)
	temp.append(mouse.y)
	y.append(mouse.y)
	temp.append(c)
	print(f"{i} : {temp}")
	mouse_co.append(temp)

print("Out of the loop...")

filename = f"Mouse XY Data {count}.csv"
	
with open(filename, 'w') as csvfile:
	csvwriter = csv.writer(csvfile)
	csvwriter.writerows(mouse_co)

print("Done Writing...")
ax = plt.figure().add_subplot(projection='3d')

ax.plot(x, y, ztime)
ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_zlabel('Time')
# ax.savefig(f'Mouse XY Graph {count}.png')
plt.show()
