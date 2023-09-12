import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import csv

count=2

co=['X','Y']

# Load your CSV data with uppercase header names
data = pd.read_csv('Mouse XY Data 4.csv')

# Rename columns to uppercase
data.columns = data.columns.str.upper()

# Extract X, Y, and TIME values
X_VALUES = data['X'].values
Y_VALUES = data['Y'].values
TIME_VALUES = data['TIME'].values

# Define the window size and step size for creating sequences
WINDOW_SIZE = 10  # Adjust as needed
STEP_SIZE = 1     # Adjust as needed

# Create input and target sequences
input_sequences = []
target_sequences = []

for i in range(0, len(X_VALUES) - WINDOW_SIZE, STEP_SIZE):
    input_seq = np.column_stack((X_VALUES[i:i+WINDOW_SIZE], Y_VALUES[i:i+WINDOW_SIZE], TIME_VALUES[i:i+WINDOW_SIZE]))
    target_seq = np.column_stack((X_VALUES[i+WINDOW_SIZE], Y_VALUES[i+WINDOW_SIZE]))
    
    input_sequences.append(input_seq)
    target_sequences.append(target_seq)

# Convert sequences to numpy arrays
input_sequences = np.array(input_sequences)
target_sequences = np.array(target_sequences)

# Split the data into training and validation sets
split_ratio = 0.8
split_index = int(len(input_sequences) * split_ratio)

X_TRAIN = input_sequences[:split_index]
Y_TRAIN = target_sequences[:split_index]
X_VAL = input_sequences[split_index:]
Y_VAL = target_sequences[split_index:]

# Define and compile the neural network model
model = keras.Sequential([
    layers.Input(shape=(WINDOW_SIZE, 3)),  # 3 input features: X, Y, TIME
    layers.Flatten(),
    layers.Dense(64, activation='relu'),
    layers.Dense(2),  # 2 output features: X and Y
])

model.compile(optimizer='adam', loss='mse')  # Mean squared error loss

# Train the model
BATCH_SIZE = 32
EPOCHS = 50  # Adjust as needed

model.fit(X_TRAIN, Y_TRAIN, validation_data=(X_VAL, Y_VAL), batch_size=BATCH_SIZE, epochs=EPOCHS)

# Now, you can use the trained model to predict intermediate points
# Given START_X, START_Y, STOP_X, STOP_Y, and TIME values, you can generate intermediate points

def generate_intermediate_points(START_X, START_Y, STOP_X, STOP_Y, TIME_VALUES, model):
    intermediate_points = []
    
    for i in range(len(TIME_VALUES)):
        temp=[]
        input_seq = np.column_stack((START_X, START_Y, TIME_VALUES[i]))
        input_seq = np.tile(input_seq, (1, WINDOW_SIZE, 1))  # Create input sequence matching model's input shape
        prediction = model.predict(input_seq)[0]
        x,y=int(prediction[0]),int(prediction[1])
        intermediate_points.append((x,y))
        temp.append(x)
        temp.append(y)
        co.append(temp)
        
        # Update START_X and START_Y for the next time step
        START_X, START_Y = prediction[0], prediction[1]
    
    return np.array(intermediate_points)

# Example usage:
START_X = 100
START_Y = 100
STOP_X = 600
STOP_Y = 800
TIME_VALUES = np.linspace(0, 10, num=50)  # Generate TIME values from 0 to 1

intermediate_points = generate_intermediate_points(START_X, START_Y, STOP_X, STOP_Y, TIME_VALUES, model)

print(intermediate_points)

filename = f"Predicted Movement {count}.csv"
    
with open(filename, 'w') as csvfile:
    csvwriter = csv.writer(csvfile)
    csvwriter.writerows(co)