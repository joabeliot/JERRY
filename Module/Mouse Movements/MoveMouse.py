import pandas as pd
import pyautogui as py
import time

data = pd.read_csv('Predicted Movement 10.csv')

Xlst = data['X'].tolist()
Ylst = data['Y'].tolist()

for x,y in zip(Xlst,Ylst):
	# time.sleep(0.001)
	py.moveTo(x,y)
