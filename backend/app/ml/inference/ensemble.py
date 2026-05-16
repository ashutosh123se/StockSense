import torch
import torch.nn.functional as F
import numpy as np

class EnsemblePredictor:
    """
    Weighted soft-voting ensemble of all three models.
    """
    def __init__(self, lstm_model, gru_model, cnn_lstm_model, device='cpu'):
        self.lstm = lstm_model.to(device)
        self.lstm.eval()
        
        self.gru = gru_model.to(device)
        self.gru.eval()
        
        self.cnn_lstm = cnn_lstm_model.to(device)
        self.cnn_lstm.eval()
        
        self.device = device
        
        # Weights from bayesian optimization
        self.weights = {
            'cnn_lstm': 0.50,
            'lstm': 0.30,
            'gru': 0.20
        }
        
    def predict(self, x_seq60, x_seq30, x_seq90):
        """
        x_seq60: [batch, 60, 47] for LSTM
        x_seq30: [batch, 30, 47] for GRU
        x_seq90: [batch, 90, 47] for CNN-LSTM
        """
        with torch.no_grad():
            x_seq60 = x_seq60.to(self.device)
            x_seq30 = x_seq30.to(self.device)
            x_seq90 = x_seq90.to(self.device)
            
            lstm_logits = self.lstm(x_seq60)
            gru_logits = self.gru(x_seq30)
            cnn_logits, price_delta = self.cnn_lstm(x_seq90)
            
            lstm_probs = F.softmax(lstm_logits, dim=1)
            gru_probs = F.softmax(gru_logits, dim=1)
            cnn_probs = F.softmax(cnn_logits, dim=1)
            
            # Weighted average
            ensemble_probs = (
                self.weights['lstm'] * lstm_probs +
                self.weights['gru'] * gru_probs +
                self.weights['cnn_lstm'] * cnn_probs
            )
            
            # Max prob is the direction
            max_probs, preds = torch.max(ensemble_probs, dim=1)
            
            # Inter-model agreement (simplified proxy: 1.0 if all agree, down to 0.33)
            lstm_preds = torch.argmax(lstm_probs, dim=1)
            gru_preds = torch.argmax(gru_probs, dim=1)
            cnn_preds = torch.argmax(cnn_probs, dim=1)
            
            agreement = ((lstm_preds == preds).float() + 
                         (gru_preds == preds).float() + 
                         (cnn_preds == preds).float()) / 3.0
            
            confidence = max_probs * agreement
            
            return {
                'probabilities': ensemble_probs.cpu().numpy(),
                'predictions': preds.cpu().numpy(), # 0: BUY, 1: HOLD, 2: SELL
                'confidence': confidence.cpu().numpy(),
                'price_delta_pct': price_delta.cpu().numpy().flatten(),
                'breakdown': {
                    'lstm_probs': lstm_probs.cpu().numpy(),
                    'gru_probs': gru_probs.cpu().numpy(),
                    'cnn_lstm_probs': cnn_probs.cpu().numpy()
                }
            }
