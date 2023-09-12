import pandas as pd
from scipy.interpolate import interp1d

# Load your CSV data
data = pd.read_csv('Mouse XY Data 1.csv')

# Extract the x and y values from the CSV file
x = data['X'].values
y = data['Y'].values

# Choose start and end points from your data
start_index = 0  # Index of the start point
end_index = 0  # Index of the end point

# Calculate the time interval if available
# time_interval = data['time'][end_index] - data['time'][start_index]

# Create an interpolation function for x and y
f_x = interp1d(range(end_index - start_index + 1), x[start_index:end_index + 1], kind='linear')
f_y = interp1d(range(end_index - start_index + 1), y[start_index:end_index + 1], kind='linear')

# Define a function to generate new points given new start and end points
def generate_new_points(new_start_x, new_start_y, new_end_x, new_end_y, num_points):
    new_x = f_x(range(num_points))
    new_y = f_y(range(num_points))
    
    # Scale and translate the new points to match the new start and end points
    x_scale = (new_end_x - new_start_x) / (new_x[-1] - new_x[0])
    y_scale = (new_end_y - new_start_y) / (new_y[-1] - new_y[0])
    new_x = new_start_x + (new_x - new_x[0]) * x_scale
    new_y = new_start_y + (new_y - new_y[0]) * y_scale
    
    return new_x, new_y

# Example: Generate new points between (new_start_x, new_start_y) and (new_end_x, new_end_y)
new_start_x = 10
new_start_y = 20
new_end_x = 30
new_end_y = 40
num_points = 100  # Number of points to generate

new_x, new_y = generate_new_points(new_start_x, new_start_y, new_end_x, new_end_y, num_points)
