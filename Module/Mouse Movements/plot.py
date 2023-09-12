import csv
import matplotlib.pyplot as plt
import pandas as pd

data = pd.read_csv('Predicted Movement 1.csv')

X_VALUES = data['X'].values
Y_VALUES = data['Y'].values

plt.plot(X_VALUES, Y_VALUES)
plt.show()

