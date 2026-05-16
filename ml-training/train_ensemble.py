import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
import mlflow
import os
import sys

# Add backend to path to import models
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.ml.models.lstm import StockLSTM
from app.ml.models.gru import StockGRU
from app.ml.models.cnn_lstm import StockCNNLSTM
from data_provider import DataProvider

# Configuration
TICKER = "RELIANCE.NS"
WINDOW_SIZE = 60
EPOCHS = 20
BATCH_SIZE = 32
LEARNING_RATE = 0.001
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# MLflow Setup
os.environ["AWS_ACCESS_KEY_ID"] = "minioadmin"
os.environ["AWS_SECRET_ACCESS_KEY"] = "minioadmin"
os.environ["MLFLOW_S3_ENDPOINT_URL"] = "http://localhost:9000"

mlflow.set_tracking_uri("http://localhost:5000")
mlflow.set_experiment("StockSense_Ensemble_Training")

def train_model(model_name, model, train_loader, val_loader, num_classes=1):
    mlflow.end_run() # Clean up any existing run
    with mlflow.start_run(run_name=model_name):
        model = model.to(DEVICE)
        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
        
        mlflow.log_param("window_size", WINDOW_SIZE)
        mlflow.log_param("epochs", EPOCHS)
        
        print(f"Training {model_name}...")
        for epoch in range(EPOCHS):
            model.train()
            train_loss = 0
            for batch_x, batch_y in train_loader:
                batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
                
                optimizer.zero_grad()
                outputs = model(batch_x)
                
                # Handle models with multiple outputs (like CNN-LSTM)
                if isinstance(outputs, tuple):
                    logits, _ = outputs
                else:
                    logits = outputs
                    
                loss = criterion(logits.squeeze(), batch_y)
                loss.backward()
                optimizer.step()
                train_loss += loss.item()
            
            # Validation
            model.eval()
            val_loss = 0
            with torch.no_grad():
                for batch_x, batch_y in val_loader:
                    batch_x, batch_y = batch_x.to(DEVICE), batch_y.to(DEVICE)
                    outputs = model(batch_x)
                    if isinstance(outputs, tuple):
                        logits, _ = outputs
                    else:
                        logits = outputs
                    loss = criterion(logits.squeeze(), batch_y)
                    val_loss += loss.item()
            
            avg_train_loss = train_loss / len(train_loader)
            avg_val_loss = val_loss / len(val_loader)
            
            mlflow.log_metric("train_loss", avg_train_loss, step=epoch)
            mlflow.log_metric("val_loss", avg_val_loss, step=epoch)
            
            if (epoch + 1) % 5 == 0:
                print(f"Epoch [{epoch+1}/{EPOCHS}], Train Loss: {avg_train_loss:.6f}, Val Loss: {avg_val_loss:.6f}")

        # Save model locally and to MLflow
        model_path = f"models/{model_name.lower()}.pt"
        os.makedirs("models", exist_ok=True)
        torch.save(model.state_dict(), model_path)
        mlflow.log_artifact(model_path)
        print(f"Finished training {model_name}. Model saved to {model_path}")

def main():
    mlflow.end_run()
    provider = DataProvider()
    df = provider.fetch_historical_data(TICKER)
    df = provider.add_technical_indicators(df)
    
    # Feature selection (Close, RSI, MACD, etc.)
    features = ['Close', 'RSI', 'MACD', 'MACD_Signal', 'BB_Upper', 'BB_Lower', 'EMA_20', 'EMA_50']
    data = df[features].values
    
    # Scaling
    import joblib
    scaler = MinMaxScaler()
    scaled_data = scaler.fit_transform(data)
    os.makedirs("models", exist_ok=True)
    joblib.dump(scaler, "models/scaler.pkl")
    mlflow.log_artifact("models/scaler.pkl")
    
    # Prepare sequences
    X, y = provider.prepare_sequences(scaled_data, WINDOW_SIZE)
    
    # Split
    split = int(len(X) * 0.8)
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]
    
    # To Tensors
    train_ds = TensorDataset(torch.FloatTensor(X_train), torch.FloatTensor(y_train))
    val_ds = TensorDataset(torch.FloatTensor(X_val), torch.FloatTensor(y_val))
    
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE)
    
    # Initialize Models
    input_dim = len(features)
    models = {
        "LSTM": StockLSTM(input_size=input_dim, num_classes=1),
        "GRU": StockGRU(input_size=input_dim, num_classes=1),
        "CNN-LSTM": StockCNNLSTM(input_size=input_dim, num_classes=1)
    }
    
    for name, model in models.items():
        train_model(name, model, train_loader, val_loader)

if __name__ == "__main__":
    main()
