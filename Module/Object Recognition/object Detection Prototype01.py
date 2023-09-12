from PIL import Image

path="D:\\Projects\\Jerry\\Object Recognition\\Lab\\Object Detection Dataset"

im=	Image.open(rb"Lab\Object Detection Dataset\obj1.png")

x=im.size[0]
y=im.size[1]

colorMatrix=[]
temp=[]

pix = im.load()

for xp in range(x):
	for yp in range(y):
		v=pix[xp,yp]
		if v==(255, 255, 255):
			v="W"
		elif v==(237, 50, 55) or (237, 50, 55, 255):
			print(v)
			v="R"
		elif v==(0, 175, 239) or (0, 175, 239, 255):
			v="B"
		temp.append(v)
	colorMatrix.append(temp)
	temp=[]

for v in colorMatrix:
	print(v)
