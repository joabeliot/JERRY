import numpy as np
import pandas as pd

# Define your start and end points (X, Y)
start_point = (10, 25)
end_point = (150, 300)

# Generate intermediate points using linspace
num_points = 11  # Adjust the number of points as needed
x_values = np.linspace(start_point[0], end_point[0], num_points)
y_values = np.linspace(start_point[1], end_point[1], num_points)

# Create a DataFrame with X and Y columns
df = pd.DataFrame({'X': x_values, 'Y': y_values})

# Save the DataFrame to a CSV file
csv_filename = 'intermediate_points.csv'
df.to_csv(csv_filename, index=False)

print(f'Intermediate points saved to {csv_filename}.')
