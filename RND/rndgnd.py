import pyautogui
import time

time.sleep(3)

# myScreenshot = pyautogui.screenshot()
# myScreenshot.save('file name.png')

def movemouse(x,y):
	pyautogui.moveTo(x, y)

def coordinates():
	x=0
	y=0
	for i in range(500):
		x+=1
		y+=1
		movemouse(x,y)

def EdgeDetection():
	import cv2
 
	# Read the original image
	img = cv2.imread('file name.png') 
	# Display original image
	cv2.imshow('Original', img)
	cv2.waitKey(0)
	 
	# Convert to graycsale
	img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
	# Blur the image for better edge detection
	img_blur = cv2.GaussianBlur(img_gray, (3,3), 0) 
	 
	# Sobel Edge Detection
	sobelx = cv2.Sobel(src=img_blur, ddepth=cv2.CV_64F, dx=1, dy=0, ksize=5) # Sobel Edge Detection on the X axis
	sobely = cv2.Sobel(src=img_blur, ddepth=cv2.CV_64F, dx=0, dy=1, ksize=5) # Sobel Edge Detection on the Y axis
	sobelxy = cv2.Sobel(src=img_blur, ddepth=cv2.CV_64F, dx=1, dy=1, ksize=5) # Combined X and Y Sobel Edge Detection
	# Display Sobel Edge Detection Images
	cv2.imshow('Sobel X', sobelx)
	cv2.waitKey(0)
	cv2.imshow('Sobel Y', sobely)
	cv2.waitKey(0)
	cv2.imshow('Sobel X Y using Sobel() function', sobelxy)
	cv2.waitKey(0)
	 
	# Canny Edge Detection
	edges = cv2.Canny(image=img_blur, threshold1=100, threshold2=200) # Canny Edge Detection
	# Display Canny Edge Detection Image
	cv2.imshow('Canny Edge Detection', edges)
	cv2.waitKey(0)
	 
	cv2.destroyAllWindows()

def imgdetection():
		
	import cv2
	import numpy as np
        x=0
	y=0
	img_rgb = cv2.imread('file name1.png')
	template = cv2.imread('spotify.png')
	w, h = template.shape[:-1]

	res = cv2.matchTemplate(img_rgb, template, cv2.TM_CCOEFF_NORMED)
	threshold = .8
	loc = np.where(res >= threshold)
	for pt in zip(*loc[::-1]):  # Switch collumns and rows
	    cv2.rectangle(img_rgb, pt, (pt[0] + w, pt[1] + h), (0, 0, 255), 2)
	    x=pt[0] + w
	    y=pt[1] + h
	movemouse(x,y)
	

	cv2.imwrite('result.png', img_rgb)

imgdetection()
